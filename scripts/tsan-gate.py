#!/usr/bin/env python3
"""Classify the ThreadSanitizer reports of a scripts/tsan.sh run; exit 1 if
one must fail the run.

    scripts/tsan-gate.py <instrumented napi_quickfix.node> <log dir> [-v]

A report is classified by WHERE ITS TWO RACING ACCESSES ARE, not by every
frame it mentions: this addon's code shows up in the call chain (or the
thread-creation stack) of most QuickFIX races, because it is what starts the
engine and calls into it from workers. For each access, the innermost frame
outside the runtime (libtsan, libc, libstdc++) decides:

  * a frame of this addon (napi_quickfix::, cpp/)            -> fail
  * a QuickFIX frame matching a known upstream race below     -> listed only
  * any other QuickFIX frame                                  -> fail
  * anything else (Node / V8 / libuv: Node is uninstrumented) -> noise

TSan symbolizes few frames of the addon by itself (no llvm-symbolizer), so
TSan suppressions by function name would not match reliably; frames are
symbolized here with addr2line instead, inline chains included.
"""
import collections
import glob
import os
import re
import subprocess
import sys

# Races inside QuickFIX v1.16.0 itself, matched against the innermost frames
# of a racing access. Each is upstream's: the same accesses race in a plain
# C++ QuickFIX application whose application threads call Session members.
KNOWN_UPSTREAM = [
    # FIX::Mutex is recursive by hand: lock() reads m_count/m_threadID before
    # pthread_mutex_lock(), and lock()/unlock() write them under it
    # (Mutex.h:56-77).
    ('FIX::Mutex recursion bookkeeping', re.compile(r'^FIX::Mutex::(lock|unlock)\(')),
    # SessionState::enabled is a plain bool, written by Session::logon()/
    # logout() with no lock and read by the network thread in Session::next()
    # (SessionState.h:56-57); FIX::Initiator/Acceptor::stop() write it from
    # the stopping thread the same way. See cpp/session_wrap.cpp.
    ('SessionState::enabled flag', re.compile(r'^FIX::SessionState::enabled\(')),
    # SessionState's last sent/received timestamps: Session::fill() (sendRaw,
    # under Session::m_mutex) and next(Message) write them on whichever thread
    # sends or receives, while the network thread's Session::next(now) reads
    # them through withinHeartBeat()/timedOut()/needHeartbeat()/... with no
    # lock (SessionState.h:100-130). Session::sendToTarget() from an
    # application thread -- here a SendToTargetWorker -- races the same way.
    ('SessionState heartbeat timestamps', re.compile(
        r'^FIX::SessionState::(lastSentTime|lastReceivedTime|withinHeartBeat|timedOut|'
        r'needHeartbeat|needTestRequest|logonTimedOut|logoutTimedOut)\(')),
]
# How many innermost frames of an access a known pattern may match: the racy
# member is usually reached through a few inlined accessors (DateTime
# arithmetic, Locker) before the SessionState/Mutex frame that names it.
KNOWN_DEPTH = 4

RUNTIME = re.compile(r'libtsan|libc\.so|libstdc\+\+|/usr/include/c\+\+/|<null> \(libc')


def symbolize(binary, addrs, root):
    """addr -> [(function, file:line)] innermost first (addr2line -i)."""
    # One addr2line for every address: -a prints each address before its
    # (variable-length, with -i) list of function/location pairs.
    out = {a: [] for a in addrs}
    if not addrs:
        return out
    lines = subprocess.run(['addr2line', '-a', '-f', '-C', '-i', '-e', binary] + list(addrs),
                           capture_output=True, text=True).stdout.splitlines()
    current, i = None, 0
    while i < len(lines):
        if re.fullmatch(r'0x[0-9a-f]+', lines[i]):
            current = '0x%x' % int(lines[i], 16)
            i += 1
        elif current is not None and i + 1 < len(lines):
            out.setdefault(current, []).append((lines[i], lines[i + 1].replace(root, '')))
            i += 2
        else:
            i += 1
    return out


def access_frames(section, sym, root):
    frames = []
    for line in section.splitlines()[1:]:
        m = re.match(r'\s*#\d+ (.*)', line)
        if not m:
            continue
        a = re.search(r'napi_quickfix\.node\+(0x[0-9a-f]+)', line)
        if a:
            frames += sym[a.group(1)]
        else:
            frames.append((m.group(1).split(' (')[0].replace(root, ''), line.replace(root, '')))
    return [f for f in frames if not RUNTIME.search(f[0] + ' ' + f[1])]


# Path tests that hold whether or not the checkout prefix was stripped (a
# symlinked or relocated checkout leaves the compile-time absolute paths).
OURS_PATH = re.compile(r'(^|/)cpp/[a-z_]+\.(cpp|h):')
QUICKFIX_PATH = re.compile(r'(^|/)(quickfix-src|qf_include)/')


def ours(frame):
    fn, loc = frame
    return 'napi_quickfix::' in fn or bool(OURS_PATH.search(loc))


def quickfix(frame):
    fn, loc = frame
    return fn.startswith('FIX::') or bool(QUICKFIX_PATH.search(loc))


def main():
    binary, logdir = sys.argv[1], sys.argv[2]
    verbose = '-v' in sys.argv[3:]
    root = os.getcwd() + '/'
    reports = []
    for path in sorted(glob.glob(os.path.join(logdir, 'tsan.*'))):
        reports += [r for r in open(path, errors='replace').read().split('==================')
                    if 'WARNING: ThreadSanitizer' in r]
    addrs = sorted(set(re.findall(r'napi_quickfix\.node\+(0x[0-9a-f]+)', ''.join(reports))))
    sym = symbolize(binary, addrs, root)

    counts = collections.Counter()
    failing = []
    for r in reports:
        header = re.search(r'WARNING: ThreadSanitizer: ([^(\n]+)', r)
        kind = header.group(1).strip() if header else '?'
        # The first access follows the WARNING line with no blank line between.
        body = re.sub(r'^.*WARNING: ThreadSanitizer:[^\n]*\n', '', r, flags=re.S)
        sections = [s.strip() for s in re.split(r'\n\s*\n', body)]
        accesses = [s for s in sections
                    if re.match(r'(Previous )?(Atomic )?(read|write|Read|Write) of size', s)][:2]
        chains = [access_frames(s, sym, root) for s in accesses]
        tops = [c[0] if c else ('?', '') for c in chains]
        if kind != 'data race':
            # Not a race between two accesses (lock-order inversion, a mutex
            # destroyed while locked, ...): decide on the whole report.
            allf = [f for s in sections for f in access_frames('x\n' + s, sym, root)]
            if any(ours(f) or quickfix(f) for f in allf):
                failing.append((kind, r, chains))
                counts[('FAIL', kind)] += 1
            else:
                counts[('noise', kind)] += 1
            continue
        if any(ours(t) for t in tops):
            label = ('FAIL', 'race in this addon: ' + ' || '.join(sorted({t[0] for t in tops})))
            failing.append((label[1], r, chains))
        elif any(quickfix(t) for t in tops):
            known = [name for name, pat in KNOWN_UPSTREAM
                     if any(pat.search(f[0]) for c in chains for f in c[:KNOWN_DEPTH])]
            if known:
                label = ('upstream', known[0])
            else:
                label = ('FAIL', 'unknown QuickFIX race: ' + ' || '.join(sorted({t[0] for t in tops})))
                failing.append((label[1], r, chains))
        else:
            label = ('noise', 'Node/V8: ' + ' || '.join(sorted({t[0][:80] for t in tops})))
        counts[label] += 1

    print(f'reports: {len(reports)}')
    for (cls, what), n in sorted(counts.items(), key=lambda kv: (kv[0][0] != 'FAIL', -kv[1])):
        print(f'{n:5}  {cls:8}  {what}')
    shown = set()
    for what, r, chains in failing:
        if what in shown and not verbose:
            continue
        shown.add(what)
        print(f'\n--- {what}', file=sys.stderr)
        for i, c in enumerate(chains):
            print(f'  access {i + 1}:', file=sys.stderr)
            for fn, loc in c[:12]:
                print(f'    {fn}  {loc}', file=sys.stderr)
    return 1 if failing else 0


if __name__ == '__main__':
    sys.exit(main())
