# TEST-ONLY TLS fixtures

**These keys and certificates are for the test suite only. They are public, so never trust them
anywhere else.**

`test/tls-tunnel.test.ts` uses them. They are committed because Node cannot issue X.509
certificates itself, and calling the `openssl` CLI at test time would add a CI dependency on the
Windows and Alpine runners. They are valid for 100 years.

| File | What |
|---|---|
| `TEST-ONLY-ca.crt` | CA that signs the server and client certs |
| `TEST-ONLY-server.{crt,key}` | Server cert for `localhost` / `127.0.0.1`, signed by the CA |
| `TEST-ONLY-client.{crt,key}` | Client cert (CN `CLIENT`) for mTLS, signed by the CA |
| `TEST-ONLY-other-ca.crt` | Unrelated CA, for the "wrong CA" test |

The CA private keys are not kept. To regenerate everything, run the following from this
directory:

```sh
set -e
D=36500
openssl req -x509 -newkey ec -pkeyopt ec_paramgen_curve:P-256 -nodes -days $D \
  -subj '/CN=napi-quickfix TEST-ONLY CA' -keyout ca.key -out TEST-ONLY-ca.crt
openssl req -x509 -newkey ec -pkeyopt ec_paramgen_curve:P-256 -nodes -days $D \
  -subj '/CN=napi-quickfix TEST-ONLY other CA' -keyout other-ca.key -out TEST-ONLY-other-ca.crt
for who in server client; do
  if [ $who = server ]; then
    CN=localhost; EXT='subjectAltName=DNS:localhost,IP:127.0.0.1
extendedKeyUsage=serverAuth'
  else
    CN=CLIENT; EXT='extendedKeyUsage=clientAuth'
  fi
  openssl req -newkey ec -pkeyopt ec_paramgen_curve:P-256 -nodes -subj "/CN=$CN" \
    -keyout TEST-ONLY-$who.key -out $who.csr
  printf '%s\n' "$EXT" > $who.ext
  openssl x509 -req -in $who.csr -CA TEST-ONLY-ca.crt -CAkey ca.key -CAcreateserial \
    -days $D -extfile $who.ext -out TEST-ONLY-$who.crt
done
rm -f ca.key other-ca.key ./*.csr ./*.ext ./*.srl
```
