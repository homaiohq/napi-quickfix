// GENERATED FILE — DO NOT EDIT.
// Source: QuickFIX v1.16.0 src/C++/FixValues.h (namespace FIX).
// Regenerate with `yarn gen:values` after moving the QuickFIX pin in CMakeLists.txt.
//
// FIX value constants: one frozen object per field, e.g. `Side.Buy === '1'`,
// `MsgType.Logon === 'A'`, `OrdStatus.New === '0'`. Values are literal types, so
// `Side.Buy` is typed as `'1'` and a misspelt name is a compile error. Every
// value is a string (FIX is string-on-the-wire), whatever its C++ declaration.
//
// Names derive from `FIX::<Field>_<VALUE>`: SCREAMING_SNAKE suffixes become
// PascalCase (`Side_SELL_SHORT` → `Side.SellShort`), already mixed-case ones
// (`MsgType_NewOrderSingle`, `MsgType_IOI`) are kept verbatim, and a key that
// would start with a digit gets a leading underscore. The full rule lives in
// scripts/gen-values.mjs.
//
// Also available as `@homaiohq/napi-quickfix/values`, which does not load the
// native addon. @__PURE__ lets bundlers drop any group nothing imports.

/** `AccountType` values (`FIX::AccountType_*`). */
export const AccountType = /* @__PURE__ */ Object.freeze({
  HouseTrader: '3',
  HouseTraderCrossMargined: '7',
  CarriedNonCustomerSideCrossMargined: '6',
  FloorTrader: '4',
  CarriedNonCustomerSide: '2',
  CarriedCustomerSide: '1',
  JointBackOfficeAccount: '8',
  EquitiesSpecialist: '9',
  OptionsMarketMaker: '10',
  OptionsFirmAccount: '11',
  AccountCustomerNonCustomerOrders: '12',
  AccountOrdersMultipleCustomers: '13',
} as const);

/** `AcctIDSource` values (`FIX::AcctIDSource_*`). */
export const AcctIDSource = /* @__PURE__ */ Object.freeze({
  Bic: '1',
  SidCode: '2',
  Tfm: '3',
  Omgeo: '4',
  DtccCode: '5',
  Other: '99',
  Spsaid: '6',
} as const);

/** `Adjustment` values (`FIX::Adjustment_*`). */
export const Adjustment = /* @__PURE__ */ Object.freeze({
  Cancel: '1',
  Error: '2',
  Correction: '3',
} as const);

/** `AdjustmentType` values (`FIX::AdjustmentType_*`). */
export const AdjustmentType = /* @__PURE__ */ Object.freeze({
  ProcessRequestAsMarginDisposition: '0',
  DeltaPlus: '1',
  DeltaMinus: '2',
  Final: '3',
  CustomerSpecificPosition: '4',
} as const);

/** `AdvSide` values (`FIX::AdvSide_*`). */
export const AdvSide = /* @__PURE__ */ Object.freeze({
  Buy: 'B',
  Sell: 'S',
  Trade: 'T',
  Cross: 'X',
} as const);

/** `AdvTransType` values (`FIX::AdvTransType_*`). */
export const AdvTransType = /* @__PURE__ */ Object.freeze({
  Cancel: 'C',
  New: 'N',
  Replace: 'R',
} as const);

/** `AffirmStatus` values (`FIX::AffirmStatus_*`). */
export const AffirmStatus = /* @__PURE__ */ Object.freeze({
  Received: '1',
  ConfirmRejected: '2',
  Affirmed: '3',
} as const);

/** `AggregatedBook` values (`FIX::AggregatedBook_*`). */
export const AggregatedBook = /* @__PURE__ */ Object.freeze({
  No: 'N',
  Yes: 'Y',
} as const);

/** `AggressorIndicator` values (`FIX::AggressorIndicator_*`). */
export const AggressorIndicator = /* @__PURE__ */ Object.freeze({
  Yes: 'Y',
  No: 'N',
} as const);

/** `AlgorithmicTradeIndicator` values (`FIX::AlgorithmicTradeIndicator_*`). */
export const AlgorithmicTradeIndicator = /* @__PURE__ */ Object.freeze({
  NonAlgorithmicTrade: '0',
  AlgorithmicTrade: '1',
} as const);

/** `AllocAccountType` values (`FIX::AllocAccountType_*`). */
export const AllocAccountType = /* @__PURE__ */ Object.freeze({
  CarriedCustomerSide: '1',
  CarriedNonCustomerSide: '2',
  HouseTrader: '3',
  FloorTrader: '4',
  CarriedNonCustomerSideCrossMargined: '6',
  HouseTraderCrossMargined: '7',
  JointBackOfficeAccount: '8',
} as const);

/** `AllocCancReplaceReason` values (`FIX::AllocCancReplaceReason_*`). */
export const AllocCancReplaceReason = /* @__PURE__ */ Object.freeze({
  OriginalDetailsIncomplete: '1',
  ChangeInUnderlyingOrderDetails: '2',
  Other: '99',
  CancelledByGiveupFirm: '3',
} as const);

/** `AllocGroupStatus` values (`FIX::AllocGroupStatus_*`). */
export const AllocGroupStatus = /* @__PURE__ */ Object.freeze({
  Added: '0',
  Canceled: '1',
  Replaced: '2',
  Changed: '3',
  Pending: '4',
} as const);

/** `AllocHandlInst` values (`FIX::AllocHandlInst_*`). */
export const AllocHandlInst = /* @__PURE__ */ Object.freeze({
  Match: '1',
  Forward: '2',
  ForwardAndMatch: '3',
  AutoClaimGiveUp: '4',
} as const);

/** `AllocIntermedReqType` values (`FIX::AllocIntermedReqType_*`). */
export const AllocIntermedReqType = /* @__PURE__ */ Object.freeze({
  PendingAccept: '1',
  PendingRelease: '2',
  PendingReversal: '3',
  Accept: '4',
  BlockLevelReject: '5',
  AccountLevelReject: '6',
} as const);

/** `AllocLinkType` values (`FIX::AllocLinkType_*`). */
export const AllocLinkType = /* @__PURE__ */ Object.freeze({
  FxNetting: '0',
  FxSwap: '1',
} as const);

/** `AllocMethod` values (`FIX::AllocMethod_*`). */
export const AllocMethod = /* @__PURE__ */ Object.freeze({
  Automatic: '1',
  Guarantor: '2',
  Manual: '3',
  BrokerAssigned: '4',
} as const);

/** `AllocNoOrdersType` values (`FIX::AllocNoOrdersType_*`). */
export const AllocNoOrdersType = /* @__PURE__ */ Object.freeze({
  NotSpecified: '0',
  ExplicitListProvided: '1',
} as const);

/** `AllocPositionEffect` values (`FIX::AllocPositionEffect_*`). */
export const AllocPositionEffect = /* @__PURE__ */ Object.freeze({
  Open: 'O',
  Close: 'C',
  Rolled: 'R',
  Fifo: 'F',
} as const);

/** `AllocRejCode` values (`FIX::AllocRejCode_*`). */
export const AllocRejCode = /* @__PURE__ */ Object.freeze({
  UnknownAccount: '0',
  IncorrectQuantity: '1',
  IncorrectAveragegPrice: '2',
  UnknownExecutingBrokerMnemonic: '3',
  CommissionDifference: '4',
  UnknownOrderId: '5',
  UnknownListId: '6',
  OtherSeeText: '7',
  IncorrectAllocatedQuantity: '8',
  CalculationDifference: '9',
  UnknownOrStaleExecId: '10',
  MismatchedData: '11',
  UnknownClOrdId: '12',
  WarehouseRequestRejected: '13',
  IncorrectAveragePrice: '2',
  DuplicateOrMissingIndividualAllocId: '14',
  TradeNotRecognized: '15',
  DuplicateTrade: '16',
  IncorrectOrMissingInstrument: '17',
  IncorrectOrMissingSettlDate: '18',
  IncorrectOrMissingFundIdOrFundName: '19',
  IncorrectOrMissingSettlInstructions: '20',
  IncorrectOrMissingFees: '21',
  IncorrectOrMissingTax: '22',
  UnknownOrMissingParty: '23',
  IncorrectOrMissingSide: '24',
  IncorrectOrMissingNetMoney: '25',
  IncorrectOrMissingTradeDate: '26',
  IncorrectOrMissingSettlCcyInstructions: '27',
  IncorrectOrMissingProcessCode: '28',
  Other: '99',
} as const);

/** `AllocReportType` values (`FIX::AllocReportType_*`). */
export const AllocReportType = /* @__PURE__ */ Object.freeze({
  SellsideCalculatedUsingPreliminary: '3',
  SellsideCalculatedWithoutPreliminary: '4',
  WarehouseRecap: '5',
  RequestToIntermediary: '8',
  PreliminaryRequestToIntermediary: '2',
  Accept: '9',
  Reject: '10',
  AcceptPending: '11',
  Complete: '12',
  ReversePending: '14',
  Giveup: '15',
  Takeup: '16',
  Reversal: '17',
  Alleged: '18',
  SubAllocationGiveup: '19',
} as const);

/** `AllocRequestStatus` values (`FIX::AllocRequestStatus_*`). */
export const AllocRequestStatus = /* @__PURE__ */ Object.freeze({
  Accepted: '0',
  Rejected: '1',
} as const);

/** `AllocReversalStatus` values (`FIX::AllocReversalStatus_*`). */
export const AllocReversalStatus = /* @__PURE__ */ Object.freeze({
  Completed: '0',
  Refused: '1',
  Cancelled: '2',
} as const);

/** `AllocSettlInstType` values (`FIX::AllocSettlInstType_*`). */
export const AllocSettlInstType = /* @__PURE__ */ Object.freeze({
  UseDefaultInstructions: '0',
  DeriveFromParametersProvided: '1',
  FullDetailsProvided: '2',
  SsidbiDsProvided: '3',
  PhoneForInstructions: '4',
} as const);

/** `AllocStatus` values (`FIX::AllocStatus_*`). */
export const AllocStatus = /* @__PURE__ */ Object.freeze({
  Accepted: '0',
  BlockLevelReject: '1',
  AccountLevelReject: '2',
  Received: '3',
  Incomplete: '4',
  RejectedByIntermediary: '5',
  AllocationPending: '6',
  Reversed: '7',
  CancelledByIntermediary: '8',
  Claimed: '9',
  Refused: '10',
  PendingGiveUpApproval: '11',
  Cancelled: '12',
  PendingTakeUpApproval: '13',
  ReversalPending: '14',
} as const);

/** `AllocTransType` values (`FIX::AllocTransType_*`). */
export const AllocTransType = /* @__PURE__ */ Object.freeze({
  New: '0',
  Replace: '1',
  Cancel: '2',
  Preliminary: '3',
  Calculated: '4',
  CalculatedWithoutPreliminary: '5',
  Reversal: '6',
} as const);

/** `AllocType` values (`FIX::AllocType_*`). */
export const AllocType = /* @__PURE__ */ Object.freeze({
  BuysideReadyToBook: '6',
  Preliminary: '2',
  SellsideCalculatedUsingPreliminary: '3',
  ReadyToBook: '5',
  Calculated: '1',
  SellsideCalculatedWithoutPreliminary: '4',
  WarehouseInstruction: '7',
  RequestToIntermediary: '8',
  Accept: '9',
  Reject: '10',
  AcceptPending: '11',
  IncompleteGroup: '12',
  CompleteGroup: '13',
  ReversalPending: '14',
  ReopenGroup: '15',
  CancelGroup: '16',
  Giveup: '17',
  Takeup: '18',
  RefuseTakeup: '19',
  InitiateReversal: '20',
  Reverse: '21',
  RefuseReversal: '22',
  SubAllocationGiveup: '23',
  ApproveGiveup: '24',
  ApproveTakeup: '25',
  NotionalValueAveragePxGroupAlloc: '26',
} as const);

/** `AllocationRollupInstruction` values (`FIX::AllocationRollupInstruction_*`). */
export const AllocationRollupInstruction = /* @__PURE__ */ Object.freeze({
  Rollup: '0',
  DoNotRollUp: '1',
} as const);

/** `ApplLevelRecoveryIndicator` values (`FIX::ApplLevelRecoveryIndicator_*`). */
export const ApplLevelRecoveryIndicator = /* @__PURE__ */ Object.freeze({
  NoApplRecoveryNeeded: '0',
  ApplRecoveryNeeded: '1',
} as const);

/** `ApplQueueAction` values (`FIX::ApplQueueAction_*`). */
export const ApplQueueAction = /* @__PURE__ */ Object.freeze({
  NoActionTaken: '0',
  QueueFlushed: '1',
  OverlayLast: '2',
  EndSession: '3',
} as const);

/** `ApplQueueResolution` values (`FIX::ApplQueueResolution_*`). */
export const ApplQueueResolution = /* @__PURE__ */ Object.freeze({
  NoActionTaken: '0',
  QueueFlushed: '1',
  OverlayLast: '2',
  EndSession: '3',
} as const);

/** `ApplReportType` values (`FIX::ApplReportType_*`). */
export const ApplReportType = /* @__PURE__ */ Object.freeze({
  ApplSeqNumReset: '0',
  LastMessageSent: '1',
  ApplicationAlive: '2',
  ResendComplete: '3',
} as const);

/** `ApplReqType` values (`FIX::ApplReqType_*`). */
export const ApplReqType = /* @__PURE__ */ Object.freeze({
  Retransmission: '0',
  Subscription: '1',
  RequestLastSeqNum: '2',
  RequestApplications: '3',
  Unsubscribe: '4',
  CancelRetransmission: '5',
  CancelRetransmissionUnsubscribe: '6',
} as const);

/** `ApplResponseError` values (`FIX::ApplResponseError_*`). */
export const ApplResponseError = /* @__PURE__ */ Object.freeze({
  ApplicationDoesNotExist: '0',
  MessagesRequestedAreNotAvailable: '1',
  UserNotAuthorizedForApplication: '2',
} as const);

/** `ApplResponseType` values (`FIX::ApplResponseType_*`). */
export const ApplResponseType = /* @__PURE__ */ Object.freeze({
  RequestSuccessfullyProcessed: '0',
  ApplicationDoesNotExist: '1',
  MessagesNotAvailable: '2',
} as const);

/** `ApplVerID` values (`FIX::ApplVerID_*`). */
export const ApplVerID = /* @__PURE__ */ Object.freeze({
  Fix27: '0',
  Fix30: '1',
  Fix40: '2',
  Fix41: '3',
  Fix42: '4',
  Fix43: '5',
  Fix44: '6',
  Fix50: '7',
  Fix50Sp1: '8',
  Fix50Sp2: '9',
} as const);

/** `AsOfIndicator` values (`FIX::AsOfIndicator_*`). */
export const AsOfIndicator = /* @__PURE__ */ Object.freeze({
  False: '0',
  True: '1',
} as const);

/** `AssetClass` values (`FIX::AssetClass_*`). */
export const AssetClass = /* @__PURE__ */ Object.freeze({
  InterestRate: '1',
  Currency: '2',
  Credit: '3',
  Equity: '4',
  Commodity: '5',
  Other: '6',
  Cash: '7',
  Debt: '8',
  Fund: '9',
  LoanFacility: '10',
  Index: '11',
} as const);

/** `AssetGroup` values (`FIX::AssetGroup_*`). */
export const AssetGroup = /* @__PURE__ */ Object.freeze({
  Financials: '1',
  Commodities: '2',
  AlternativeInvestments: '3',
} as const);

/** `AssetSubClass` values (`FIX::AssetSubClass_*`). */
export const AssetSubClass = /* @__PURE__ */ Object.freeze({
  Metals: '13',
  Bullion: '14',
  Energy: '15',
  CommodityIndex: '16',
  Agricultural: '17',
  Environmental: '18',
  Freight: '19',
  Fertilizer: '41',
  IndustrialProduct: '42',
  Inflation: '43',
  Paper: '44',
  Polypropylene: '45',
  OfficialEconomicStatistics: '46',
  SingleName: '4',
  CreditIndex: '5',
  IndexTranche: '6',
  CreditBasket: '7',
  Basket: '3',
  FxCrossRates: '38',
  FxEmergingMarkets: '39',
  FxMajors: '40',
  Government: '20',
  Agency: '21',
  Corporate: '22',
  Financing: '23',
  MoneyMarket: '24',
  Mortgage: '25',
  Municipal: '26',
  Common: '9',
  Preferred: '10',
  EquityIndex: '11',
  EquityBasket: '12',
  DividendIndex: '34',
  StockDividend: '35',
  ExchangeTradedFund: '36',
  VolatilityIndex: '37',
  MutualFund: '27',
  CollectiveInvestmentVehicle: '28',
  InvestmentProgram: '29',
  SpecializedAccountProgram: '30',
  SingleCurrency: '1',
  CrossCurrency: '2',
  TermLoan: '31',
  BridgeLoan: '32',
  LetterOfCredit: '33',
  Exotic: '8',
  OtherC10: '47',
  Other: '48',
} as const);

/** `AssignmentMethod` values (`FIX::AssignmentMethod_*`). */
export const AssignmentMethod = /* @__PURE__ */ Object.freeze({
  Random: 'R',
  ProRata: 'P',
} as const);

/** `AttachmentEncodingType` values (`FIX::AttachmentEncodingType_*`). */
export const AttachmentEncodingType = /* @__PURE__ */ Object.freeze({
  Base64: '0',
  RawBinary: '1',
} as const);

/** `AuctionInstruction` values (`FIX::AuctionInstruction_*`). */
export const AuctionInstruction = /* @__PURE__ */ Object.freeze({
  AutomatedAuctionPermitted: '0',
  AutomatedAuctionNotPermitted: '1',
} as const);

/** `AuctionType` values (`FIX::AuctionType_*`). */
export const AuctionType = /* @__PURE__ */ Object.freeze({
  None: '0',
  BlockOrderAuction: '1',
  DirectedOrderAuction: '2',
  ExposureOrderAuction: '3',
  FlashOrderAuction: '4',
  FacilitationOrderAuction: '5',
  SolicitationOrderAuction: '6',
  PriceImprovementMechanism: '7',
  DirectedOrderPriceImprovementMechanism: '8',
} as const);

/** `AveragePriceType` values (`FIX::AveragePriceType_*`). */
export const AveragePriceType = /* @__PURE__ */ Object.freeze({
  TimeWeightedAveragePrice: '0',
  VolumeWeightedAveragePrice: '1',
  PercentOfVolumeAveragePrice: '2',
  LimitOrderAveragePrice: '3',
} as const);

/** `AvgPxIndicator` values (`FIX::AvgPxIndicator_*`). */
export const AvgPxIndicator = /* @__PURE__ */ Object.freeze({
  NoAveragePricing: '0',
  Trade: '1',
  LastTrade: '2',
  NotionalValueAveragePxGroupTrade: '3',
  AveragePricedTrade: '4',
} as const);

/** `BasisPxType` values (`FIX::BasisPxType_*`). */
export const BasisPxType = /* @__PURE__ */ Object.freeze({
  ClosingPriceAtMorningSession: '2',
  ClosingPrice: '3',
  CurrentPrice: '4',
  Sq: '5',
  VwapThroughADay: '6',
  VwapThroughAMorningSession: '7',
  VwapThroughAnAfternoonSession: '8',
  VwapThroughADayExcept: '9',
  VwapThroughAMorningSessionExcept: 'A',
  VwapThroughAnAfternoonSessionExcept: 'B',
  Strike: 'C',
  Open: 'D',
  Others: 'Z',
} as const);

/** `BatchProcessMode` values (`FIX::BatchProcessMode_*`). */
export const BatchProcessMode = /* @__PURE__ */ Object.freeze({
  Update: '0',
  Snapshot: '1',
} as const);

/** `Benchmark` values (`FIX::Benchmark_*`). */
export const Benchmark = /* @__PURE__ */ Object.freeze({
  Curve: '1',
  FiveYr: '2',
  Old5: '3',
  TenYr: '4',
  Old10: '5',
  ThirtyYr: '6',
  Old30: '7',
  ThreeMolibor: '8',
  SixMolibor: '9',
} as const);

/** `BenchmarkCurveName` values (`FIX::BenchmarkCurveName_*`). */
export const BenchmarkCurveName = /* @__PURE__ */ Object.freeze({
  Swap: 'SWAP',
  Libid: 'LIBID',
  Other: 'OTHER',
  Treasury: 'Treasury',
  Euribor: 'EURIBOR',
  Pfandbriefe: 'Pfandbriefe',
  FutureSwap: 'FutureSWAP',
  MuniAaa: 'MuniAAA',
  Libor: 'LIBOR',
  Eonia: 'EONIA',
  Eurepo: 'EUREPO',
  Sonia: 'SONIA',
  FedFundRateEffective: 'FEDEFF',
  FedOpen: 'FEDOPEN',
  Aubsw: 'AUBSW',
  Bubor: 'BUBOR',
  Cdor: 'CDOR',
  Cibor: 'CIBOR',
  Eoniaswap: 'EONIASWAP',
  Estr: 'ESTR',
  Eurodollar: 'EURODOLLAR',
  Euroswiss: 'EUROSWISS',
  Gcfrepo: 'GCFREPO',
  Isdafix: 'ISDAFIX',
  Jibar: 'JIBAR',
  Mosprim: 'MOSPRIM',
  Nibor: 'NIBOR',
  Pribor: 'PRIBOR',
  Sofr: 'SOFR',
  Stibor: 'STIBOR',
  Telbor: 'TELBOR',
  Tibor: 'TIBOR',
  Wibor: 'WIBOR',
  Aonia: 'AONIA',
  Aoniar: 'AONIA-R',
  Bkbm: 'BKBM',
  Cd19D: 'CD91D',
  Corra: 'CORRA',
  Dirrtn: 'DIRR-TN',
  Eibor: 'EIBOR',
  FixingRepoRate: 'FixingRepoRate',
  Hibor: 'HIBOR',
  Ibr: 'IBR',
  Klibor: 'KLIBOR',
  Mibor: 'MIBOR',
  Nzonia: 'NZONIA',
  Phiref: 'PHIREF',
  Reibor: 'REIBOR',
  Saibor: 'SAIBOR',
  Saron: 'SARON',
  Sora: 'SORA',
  Tlref: 'TLREF',
  Tiie: 'TIIE',
  Thbfix: 'THBFIX',
  Tonar: 'TONAR',
} as const);

/** `BidDescriptorType` values (`FIX::BidDescriptorType_*`). */
export const BidDescriptorType = /* @__PURE__ */ Object.freeze({
  Index: '3',
  Country: '2',
  Sector: '1',
} as const);

/** `BidRequestTransType` values (`FIX::BidRequestTransType_*`). */
export const BidRequestTransType = /* @__PURE__ */ Object.freeze({
  Cancel: 'C',
  New: 'N',
} as const);

/** `BidTradeType` values (`FIX::BidTradeType_*`). */
export const BidTradeType = /* @__PURE__ */ Object.freeze({
  RiskTrade: 'R',
  VwapGuarantee: 'G',
  Agency: 'A',
  GuaranteedClose: 'J',
} as const);

/** `BidType` values (`FIX::BidType_*`). */
export const BidType = /* @__PURE__ */ Object.freeze({
  NonDisclosed: '1',
  Disclosed: '2',
  NoBiddingProcess: '3',
} as const);

/** `BlockTrdAllocIndicator` values (`FIX::BlockTrdAllocIndicator_*`). */
export const BlockTrdAllocIndicator = /* @__PURE__ */ Object.freeze({
  BlockToBeAllocated: '0',
  BlockNotToBeAllocated: '1',
  AllocatedTrade: '2',
} as const);

/** `BookingType` values (`FIX::BookingType_*`). */
export const BookingType = /* @__PURE__ */ Object.freeze({
  RegularBooking: '0',
  Cfd: '1',
  TotalReturnSwap: '2',
} as const);

/** `BookingUnit` values (`FIX::BookingUnit_*`). */
export const BookingUnit = /* @__PURE__ */ Object.freeze({
  AggregatePartialExecutionsOnThisOrder: '1',
  AggregateExecutionsForThisSymbol: '2',
  EachPartialExecutionIsABookableUnit: '0',
} as const);

/** `BusinessDayConvention` values (`FIX::BusinessDayConvention_*`). */
export const BusinessDayConvention = /* @__PURE__ */ Object.freeze({
  NotApplicable: '0',
  None: '1',
  FollowingDay: '2',
  FloatingRateNote: '3',
  ModifiedFollowingDay: '4',
  PrecedingDay: '5',
  ModifiedPrecedingDay: '6',
  NearestDay: '7',
} as const);

/** `BusinessRejectReason` values (`FIX::BusinessRejectReason_*`). */
export const BusinessRejectReason = /* @__PURE__ */ Object.freeze({
  Other: '0',
  UnknownId: '1',
  UnknownSecurity: '2',
  UnsupportedMessageType: '3',
  ApplicationNotAvailable: '4',
  ConditionallyRequiredFieldMissing: '5',
  DeliverToFirmNotAvailableAtThisTime: '7',
  NotAuthorized: '6',
  InvalidPriceIncrement: '18',
  ThrottleLimitExceeded: '8',
  ThrottleLimitExceededSessionDisconnected: '9',
  ThrottledMessagesRejectedOnRequest: '10',
} as const);

/** `CPProgram` values (`FIX::CPProgram_*`). */
export const CPProgram = /* @__PURE__ */ Object.freeze({
  Program3a3: '1',
  Program42: '2',
  Other: '99',
  Program3a2: '3',
  Program3a3And3c7: '4',
  Program3a4: '5',
  Program3a5: '6',
  Program3a7: '7',
  Program3c7: '8',
} as const);

/** `CalculationMethod` values (`FIX::CalculationMethod_*`). */
export const CalculationMethod = /* @__PURE__ */ Object.freeze({
  Automatic: '0',
  Manual: '1',
} as const);

/** `CancellationRights` values (`FIX::CancellationRights_*`). */
export const CancellationRights = /* @__PURE__ */ Object.freeze({
  NoWaiverAgreement: 'M',
  NoExecutionOnly: 'N',
  Yes: 'Y',
  NoInstitutional: 'O',
} as const);

/** `CashMargin` values (`FIX::CashMargin_*`). */
export const CashMargin = /* @__PURE__ */ Object.freeze({
  MarginOpen: '2',
  MarginClose: '3',
  Cash: '1',
} as const);

/** `CashSettlPriceDefault` values (`FIX::CashSettlPriceDefault_*`). */
export const CashSettlPriceDefault = /* @__PURE__ */ Object.freeze({
  Close: '0',
  Hedge: '1',
} as const);

/** `CashSettlQuoteMethod` values (`FIX::CashSettlQuoteMethod_*`). */
export const CashSettlQuoteMethod = /* @__PURE__ */ Object.freeze({
  Bid: '0',
  Mid: '1',
  Offer: '2',
} as const);

/** `CashSettlValuationMethod` values (`FIX::CashSettlValuationMethod_*`). */
export const CashSettlValuationMethod = /* @__PURE__ */ Object.freeze({
  Market: '0',
  Highest: '1',
  AverageMarket: '2',
  AverageHighest: '3',
  BlendedMarket: '4',
  BlendedHighest: '5',
  AverageBlendedMarket: '6',
  AverageBlendedHighest: '7',
} as const);

/** `ClearedIndicator` values (`FIX::ClearedIndicator_*`). */
export const ClearedIndicator = /* @__PURE__ */ Object.freeze({
  NotCleared: '0',
  Cleared: '1',
  Submitted: '2',
  Rejected: '3',
} as const);

/** `ClearingAccountType` values (`FIX::ClearingAccountType_*`). */
export const ClearingAccountType = /* @__PURE__ */ Object.freeze({
  Customer: '1',
  Firm: '2',
  MarketMaker: '3',
} as const);

/** `ClearingFeeIndicator` values (`FIX::ClearingFeeIndicator_*`). */
export const ClearingFeeIndicator = /* @__PURE__ */ Object.freeze({
  Firms106HAnd106J: 'H',
  FifthYearDelegate: '5',
  FourthYearDelegate: '4',
  ThirdYearDelegate: '3',
  SecondYearDelegate: '2',
  FirstYearDelegate: '1',
  AllOtherOwnershipTypes: 'M',
  Gim: 'I',
  SixthYearDelegate: '9',
  FullAndAssociateMember: 'F',
  EquityMemberAndClearingMember: 'E',
  NonMemberAndCustomer: 'C',
  CboeMember: 'B',
  Lessee106FEmployees: 'L',
} as const);

/** `ClearingInstruction` values (`FIX::ClearingInstruction_*`). */
export const ClearingInstruction = /* @__PURE__ */ Object.freeze({
  ManualMode: '8',
  MultilateralNetting: '5',
  AutomaticPostingMode: '9',
  BilateralNettingOnly: '2',
  ClearAgainstCentralCounterparty: '6',
  AutomaticGiveUpMode: '10',
  SpecialTrade: '4',
  ExClearing: '3',
  ProcessNormally: '0',
  ExcludeFromCentralCounterparty: '7',
  ExcludeFromAllNetting: '1',
  QualifiedServiceRepresentativeQsr: '11',
  CustomerTrade: '12',
  SelfClearing: '13',
  BuyIn: '14',
} as const);

/** `ClearingIntention` values (`FIX::ClearingIntention_*`). */
export const ClearingIntention = /* @__PURE__ */ Object.freeze({
  DoNotIntendToClear: '0',
  IntendToClear: '1',
} as const);

/** `ClearingRequirementException` values (`FIX::ClearingRequirementException_*`). */
export const ClearingRequirementException = /* @__PURE__ */ Object.freeze({
  NoException: '0',
  Exception: '1',
  EndUserException: '2',
  InterAffiliateException: '3',
  TreasuryAffiliateException: '4',
  CooperativeException: '5',
} as const);

/** `CollAction` values (`FIX::CollAction_*`). */
export const CollAction = /* @__PURE__ */ Object.freeze({
  Retain: '0',
  Add: '1',
  Remove: '2',
} as const);

/** `CollApplType` values (`FIX::CollApplType_*`). */
export const CollApplType = /* @__PURE__ */ Object.freeze({
  SpecificDeposit: '0',
  General: '1',
} as const);

/** `CollAsgnReason` values (`FIX::CollAsgnReason_*`). */
export const CollAsgnReason = /* @__PURE__ */ Object.freeze({
  Initial: '0',
  Scheduled: '1',
  TimeWarning: '2',
  MarginDeficiency: '3',
  MarginExcess: '4',
  ForwardCollateralDemand: '5',
  EventOfDefault: '6',
  AdverseTaxEvent: '7',
  TransferDeposit: '8',
  TransferWithdrawal: '9',
  Pledge: '10',
} as const);

/** `CollAsgnRejectReason` values (`FIX::CollAsgnRejectReason_*`). */
export const CollAsgnRejectReason = /* @__PURE__ */ Object.freeze({
  UnknownDeal: '0',
  UnknownOrInvalidInstrument: '1',
  UnauthorizedTransaction: '2',
  InsufficientCollateral: '3',
  InvalidTypeOfCollateral: '4',
  ExcessiveSubstitution: '5',
  Other: '99',
} as const);

/** `CollAsgnRespType` values (`FIX::CollAsgnRespType_*`). */
export const CollAsgnRespType = /* @__PURE__ */ Object.freeze({
  Received: '0',
  Accepted: '1',
  Declined: '2',
  Rejected: '3',
  TransactionPending: '4',
  TransactionCompletedWithWarning: '5',
} as const);

/** `CollAsgnTransType` values (`FIX::CollAsgnTransType_*`). */
export const CollAsgnTransType = /* @__PURE__ */ Object.freeze({
  New: '0',
  Replace: '1',
  Cancel: '2',
  Release: '3',
  Reverse: '4',
} as const);

/** `CollInquiryQualifier` values (`FIX::CollInquiryQualifier_*`). */
export const CollInquiryQualifier = /* @__PURE__ */ Object.freeze({
  TradeDate: '0',
  GcInstrument: '1',
  CollateralInstrument: '2',
  SubstitutionEligible: '3',
  NotAssigned: '4',
  PartiallyAssigned: '5',
  FullyAssigned: '6',
  OutstandingTrades: '7',
} as const);

/** `CollInquiryResult` values (`FIX::CollInquiryResult_*`). */
export const CollInquiryResult = /* @__PURE__ */ Object.freeze({
  Successful: '0',
  InvalidOrUnknownInstrument: '1',
  InvalidOrUnknownCollateralType: '2',
  InvalidParties: '3',
  InvalidTransportTypeRequested: '4',
  InvalidDestinationRequested: '5',
  NoCollateralFoundForTheTradeSpecified: '6',
  NoCollateralFoundForTheOrderSpecified: '7',
  CollateralInquiryTypeNotSupported: '8',
  UnauthorizedForCollateralInquiry: '9',
  Other: '99',
} as const);

/** `CollInquiryStatus` values (`FIX::CollInquiryStatus_*`). */
export const CollInquiryStatus = /* @__PURE__ */ Object.freeze({
  Accepted: '0',
  AcceptedWithWarnings: '1',
  Completed: '2',
  CompletedWithWarnings: '3',
  Rejected: '4',
} as const);

/** `CollRptRejectReason` values (`FIX::CollRptRejectReason_*`). */
export const CollRptRejectReason = /* @__PURE__ */ Object.freeze({
  UnknownTrade: '0',
  UnknownInstrument: '1',
  UnknownCounterparty: '2',
  UnknownPosition: '3',
  UnacceptableCollateral: '4',
  Other: '99',
} as const);

/** `CollRptStatus` values (`FIX::CollRptStatus_*`). */
export const CollRptStatus = /* @__PURE__ */ Object.freeze({
  Accepted: '0',
  Received: '1',
  Rejected: '2',
} as const);

/** `CollStatus` values (`FIX::CollStatus_*`). */
export const CollStatus = /* @__PURE__ */ Object.freeze({
  Unassigned: '0',
  PartiallyAssigned: '1',
  AssignmentProposed: '2',
  Assigned: '3',
  Challenged: '4',
  Reused: '5',
} as const);

/** `CollateralAmountType` values (`FIX::CollateralAmountType_*`). */
export const CollateralAmountType = /* @__PURE__ */ Object.freeze({
  MarketValuation: '0',
  PortfolioValue: '1',
  ValueConfirmed: '2',
  CollateralCreditValue: '3',
  AdditionalCollateralValue: '4',
  EstimatedMarketValuation: '5',
} as const);

/** `CollateralReinvestmentType` values (`FIX::CollateralReinvestmentType_*`). */
export const CollateralReinvestmentType = /* @__PURE__ */ Object.freeze({
  MoneyMarketFund: '0',
  OtherComingledPool: '1',
  RepoMarket: '2',
  DirectPurchaseOfSecurities: '3',
  OtherInvestments: '4',
} as const);

/** `CommType` values (`FIX::CommType_*`). */
export const CommType = /* @__PURE__ */ Object.freeze({
  PerUnit: '1',
  Percent: '2',
  Absolute: '3',
  PointsPerBondOrContract: '6',
  PercentageWaivedEnhancedUnits: '5',
  PercentageWaivedCashDiscount: '4',
  BasisPoints: '7',
  AmountPerContract: '8',
} as const);

/** `CommissionAmountSubType` values (`FIX::CommissionAmountSubType_*`). */
export const CommissionAmountSubType = /* @__PURE__ */ Object.freeze({
  ResearchPaymentAccount: '0',
  CommissionSharingAgreement: '1',
  OtherTypeResearchPayment: '2',
} as const);

/** `CommissionAmountType` values (`FIX::CommissionAmountType_*`). */
export const CommissionAmountType = /* @__PURE__ */ Object.freeze({
  Unspecified: '0',
  Acceptance: '1',
  Broker: '2',
  ClearingBroker: '3',
  Retail: '4',
  SalesCommission: '5',
  LocalCommission: '6',
  ResearchPayment: '7',
} as const);

/** `CommodityFinalPriceType` values (`FIX::CommodityFinalPriceType_*`). */
export const CommodityFinalPriceType = /* @__PURE__ */ Object.freeze({
  ArgusMcCloskey: '0',
  Baltic: '1',
  Exchange: '2',
  GlobalCoal: '3',
  IhsMcCloskey: '4',
  Platts: '5',
  Other: '99',
} as const);

/** `ComplexEventCondition` values (`FIX::ComplexEventCondition_*`). */
export const ComplexEventCondition = /* @__PURE__ */ Object.freeze({
  And: '1',
  Or: '2',
} as const);

/** `ComplexEventCreditEventNotifyingParty` values (`FIX::ComplexEventCreditEventNotifyingParty_*`). */
export const ComplexEventCreditEventNotifyingParty = /* @__PURE__ */ Object.freeze({
  SellerNotifies: '0',
  BuyerNotifies: '1',
  SellerOrBuyerNotifies: '2',
} as const);

/** `ComplexEventDateOffsetDayType` values (`FIX::ComplexEventDateOffsetDayType_*`). */
export const ComplexEventDateOffsetDayType = /* @__PURE__ */ Object.freeze({
  Business: '0',
  Calendar: '1',
  CommodityBusiness: '2',
  CurrencyBusiness: '3',
  ExchangeBusiness: '4',
  ScheduledTradingDay: '5',
} as const);

/** `ComplexEventPVFinalPriceElectionFallback` values (`FIX::ComplexEventPVFinalPriceElectionFallback_*`). */
export const ComplexEventPVFinalPriceElectionFallback = /* @__PURE__ */ Object.freeze({
  Close: '0',
  HedgeElection: '1',
} as const);

/** `ComplexEventPeriodType` values (`FIX::ComplexEventPeriodType_*`). */
export const ComplexEventPeriodType = /* @__PURE__ */ Object.freeze({
  AsianOut: '0',
  AsianIn: '1',
  BarrierCap: '2',
  BarrierFloor: '3',
  KnockOut: '4',
  KnockIn: '5',
} as const);

/** `ComplexEventPriceBoundaryMethod` values (`FIX::ComplexEventPriceBoundaryMethod_*`). */
export const ComplexEventPriceBoundaryMethod = /* @__PURE__ */ Object.freeze({
  LessThanComplexEventPrice: '1',
  LessThanOrEqualToComplexEventPrice: '2',
  EqualToComplexEventPrice: '3',
  GreaterThanOrEqualToComplexEventPrice: '4',
  GreaterThanComplexEventPrice: '5',
} as const);

/** `ComplexEventPriceTimeType` values (`FIX::ComplexEventPriceTimeType_*`). */
export const ComplexEventPriceTimeType = /* @__PURE__ */ Object.freeze({
  Expiration: '1',
  Immediate: '2',
  SpecifiedDate: '3',
  Close: '4',
  Open: '5',
  OfficialSettlPrice: '6',
  DerivativesClose: '7',
  AsSpecifiedMasterConfirmation: '8',
} as const);

/** `ComplexEventQuoteBasis` values (`FIX::ComplexEventQuoteBasis_*`). */
export const ComplexEventQuoteBasis = /* @__PURE__ */ Object.freeze({
  Currency1PerCurrency2: '0',
  Currency2PerCurrency1: '1',
} as const);

/** `ComplexEventType` values (`FIX::ComplexEventType_*`). */
export const ComplexEventType = /* @__PURE__ */ Object.freeze({
  Capped: '1',
  Trigger: '2',
  KnockInUp: '3',
  KnockInDown: '4',
  KnockOutUp: '5',
  KnockOutDown: '6',
  Underlying: '7',
  ResetBarrier: '8',
  RollingBarrier: '9',
  OneTouch: '10',
  NoTouch: '11',
  DblOneTouch: '12',
  DblNoTouch: '13',
  FxComposite: '14',
  FxQuanto: '15',
  FxCrssCcy: '16',
  StrkSpread: '17',
  ClndrSpread: '18',
  PxObsvtn: '19',
  PassThrough: '20',
  StrkSched: '21',
  EquityValuation: '22',
  DividendValuation: '23',
} as const);

/** `ComplexOptPayoutTime` values (`FIX::ComplexOptPayoutTime_*`). */
export const ComplexOptPayoutTime = /* @__PURE__ */ Object.freeze({
  Close: '0',
  Open: '1',
  OfficialSettl: '2',
  ValuationTime: '3',
  ExcahgneSettlTime: '4',
  DerivativesClose: '5',
  AsSpecified: '6',
} as const);

/** `ConfirmRejReason` values (`FIX::ConfirmRejReason_*`). */
export const ConfirmRejReason = /* @__PURE__ */ Object.freeze({
  MismatchedAccount: '1',
  MissingSettlementInstructions: '2',
  Other: '99',
  UnknownOrMissingIndividualAllocId: '3',
  TransactionNotRecognized: '4',
  DuplicateTransaction: '5',
  IncorrectOrMissingInstrument: '6',
  IncorrectOrMissingPrice: '7',
  IncorrectOrMissingCommission: '8',
  IncorrectOrMissingSettlDate: '9',
  IncorrectOrMissingFundIdOrFundName: '10',
  IncorrectOrMissingQuantity: '11',
  IncorrectOrMissingFees: '12',
  IncorrectOrMissingTax: '13',
  IncorrectOrMissingParty: '14',
  IncorrectOrMissingSide: '15',
  IncorrectOrMissingNetMoney: '16',
  IncorrectOrMissingTradeDate: '17',
  IncorrectOrMissingSettlCcyInstructions: '18',
  IncorrectOrMissingCapacity: '19',
} as const);

/** `ConfirmStatus` values (`FIX::ConfirmStatus_*`). */
export const ConfirmStatus = /* @__PURE__ */ Object.freeze({
  Received: '1',
  MismatchedAccount: '2',
  MissingSettlementInstructions: '3',
  Confirmed: '4',
  RequestRejected: '5',
} as const);

/** `ConfirmTransType` values (`FIX::ConfirmTransType_*`). */
export const ConfirmTransType = /* @__PURE__ */ Object.freeze({
  New: '0',
  Replace: '1',
  Cancel: '2',
} as const);

/** `ConfirmType` values (`FIX::ConfirmType_*`). */
export const ConfirmType = /* @__PURE__ */ Object.freeze({
  Status: '1',
  Confirmation: '2',
  ConfirmationRequestRejected: '3',
} as const);

/** `ConfirmationMethod` values (`FIX::ConfirmationMethod_*`). */
export const ConfirmationMethod = /* @__PURE__ */ Object.freeze({
  NonElectronic: '0',
  Electronic: '1',
  Unconfirmed: '2',
} as const);

/** `ContAmtType` values (`FIX::ContAmtType_*`). */
export const ContAmtType = /* @__PURE__ */ Object.freeze({
  NetSettlementAmount: '15',
  CommissionAmount: '1',
  CommissionPercent: '2',
  InitialChargeAmount: '3',
  InitialChargePercent: '4',
  DiscountAmount: '5',
  DiscountPercent: '6',
  DilutionLevyAmount: '7',
  DilutionLevyPercent: '8',
  ExitChargeAmount: '9',
  ExitChargePercent: '10',
  FundBasedRenewalCommissionPercent: '11',
  ProjectedFundValue: '12',
  FundBasedRenewalCommissionOnFund: '14',
  FundBasedRenewalCommissionOnOrder: '13',
} as const);

/** `ContingencyType` values (`FIX::ContingencyType_*`). */
export const ContingencyType = /* @__PURE__ */ Object.freeze({
  OneCancelsTheOther: '1',
  OneTriggersTheOther: '2',
  OneUpdatesTheOtherAbsolute: '3',
  OneUpdatesTheOtherProportional: '4',
  BidAndOffer: '5',
  BidAndOfferOco: '6',
} as const);

/** `ContractMultiplierUnit` values (`FIX::ContractMultiplierUnit_*`). */
export const ContractMultiplierUnit = /* @__PURE__ */ Object.freeze({
  Shares: '0',
  Hours: '1',
  Days: '2',
} as const);

/** `ContractRefPosType` values (`FIX::ContractRefPosType_*`). */
export const ContractRefPosType = /* @__PURE__ */ Object.freeze({
  TwoComponentIntercommoditySpread: '0',
  IndexOrBasket: '1',
  TwoComponentLocationBasis: '2',
  Other: '99',
} as const);

/** `CorporateAction` values (`FIX::CorporateAction_*`). */
export const CorporateAction = /* @__PURE__ */ Object.freeze({
  ExDividend: 'A',
  ExDistribution: 'B',
  ExRights: 'C',
  New: 'D',
  ExInterest: 'E',
  CashDividend: 'F',
  StockDividend: 'G',
  NonIntegerStockSplit: 'H',
  ReverseStockSplit: 'I',
  StandardIntegerStockSplit: 'J',
  PositionConsolidation: 'K',
  LiquidationReorganization: 'L',
  MergerReorganization: 'M',
  RightsOffering: 'N',
  ShareholderMeeting: 'O',
  Spinoff: 'P',
  TenderOffer: 'Q',
  Warrant: 'R',
  SpecialAction: 'S',
  SymbolConversion: 'T',
  Cusip: 'U',
  LeapRollover: 'V',
  SuccessionEvent: 'W',
} as const);

/** `CouponDayCount` values (`FIX::CouponDayCount_*`). */
export const CouponDayCount = /* @__PURE__ */ Object.freeze({
  OneOne: '0',
  ThirtyThreeSixtyUs: '1',
  ThirtyThreeSixtySia: '2',
  ThirtyThreeSixtyM: '3',
  ThirtyEThreeSixty: '4',
  ThirtyEThreeSixtyIsda: '5',
  ActThreeSixty: '6',
  ActThreeSixtyFiveFixed: '7',
  ActActAfb: '8',
  ActActIcma: '9',
  ActActIsmaUltimo: '10',
  ActActIsda: '11',
  BusTwoFiftyTwo: '12',
  ThirtyEPlusThreeSixty: '13',
  ActThreeSixtyFiveL: '14',
  NlThreeSixtyFive: '15',
  NlThreeSixty: '16',
  Act364: '17',
  ThirtyThreeSixtyFive: '18',
  ThirtyActual: '19',
  ThirtyThreeSixtyIcma: '20',
  ThirtyETwoThreeSixty: '21',
  ThirtyEThreeThreeSixty: '22',
  Other: '99',
} as const);

/** `CouponFrequencyUnit` values (`FIX::CouponFrequencyUnit_*`). */
export const CouponFrequencyUnit = /* @__PURE__ */ Object.freeze({
  Day: 'D',
  Week: 'Wk',
  Month: 'Mo',
  Year: 'Yr',
  Hour: 'H',
  Minute: 'Min',
  Second: 'S',
  Term: 'T',
} as const);

/** `CouponType` values (`FIX::CouponType_*`). */
export const CouponType = /* @__PURE__ */ Object.freeze({
  Zero: '0',
  FixedRate: '1',
  FloatingRate: '2',
  Structured: '3',
} as const);

/** `CoveredOrUncovered` values (`FIX::CoveredOrUncovered_*`). */
export const CoveredOrUncovered = /* @__PURE__ */ Object.freeze({
  Covered: '0',
  Uncovered: '1',
} as const);

/** `CrossPrioritization` values (`FIX::CrossPrioritization_*`). */
export const CrossPrioritization = /* @__PURE__ */ Object.freeze({
  SellSideIsPrioritized: '2',
  None: '0',
  BuySideIsPrioritized: '1',
} as const);

/** `CrossType` values (`FIX::CrossType_*`). */
export const CrossType = /* @__PURE__ */ Object.freeze({
  CrossAon: '1',
  CrossIoc: '2',
  CrossOneSide: '3',
  CrossSamePrice: '4',
  BasisCross: '5',
  ContingentCross: '6',
  VwapCross: '7',
  StsCross: '8',
  CustomerToCustomer: '9',
} as const);

/** `CrossedIndicator` values (`FIX::CrossedIndicator_*`). */
export const CrossedIndicator = /* @__PURE__ */ Object.freeze({
  NoCross: '0',
  CrossRejected: '1',
  CrossAccepted: '2',
} as const);

/** `CurrencyCodeSource` values (`FIX::CurrencyCodeSource_*`). */
export const CurrencyCodeSource = /* @__PURE__ */ Object.freeze({
  Cusip: '1',
  Sedol: '2',
  IsinNumber: '4',
  IsoCurrencyCode: '6',
  FinancialInstrumentGlobalIdentifier: 'S',
  DigitalTokenIdentifier: 'Y',
} as const);

/** `CustOrderCapacity` values (`FIX::CustOrderCapacity_*`). */
export const CustOrderCapacity = /* @__PURE__ */ Object.freeze({
  MemberTradingForTheirOwnAccount: '1',
  ClearingFirmTradingForItsProprietaryAccount: '2',
  MemberTradingForAnotherMember: '3',
  AllOther: '4',
  RetailCustomer: '5',
} as const);

/** `CustOrderHandlingInst` values (`FIX::CustOrderHandlingInst_*`). */
export const CustOrderHandlingInst = /* @__PURE__ */ Object.freeze({
  AddOnOrder: 'ADD',
  AllOrNone: 'AON',
  CashNotHeld: 'CNH',
  DirectedOrder: 'DIR',
  ExchangeForPhysicalTransaction: 'E.W',
  FillOrKill: 'FOK',
  ImbalanceOnly: 'IO',
  ImmediateOrCancel: 'IOC',
  LimitOnOpen: 'LOO',
  LimitOnClose: 'LOC',
  MarketAtOpen: 'MAO',
  MarketAtClose: 'MAC',
  MarketOnOpen: 'MOO',
  MarketOnClose: 'MOC',
  MinimumQuantity: 'MQT',
  NotHeld: 'NH',
  OverTheDay: 'OVD',
  Pegged: 'PEG',
  ReserveSizeOrder: 'RSV',
  StopStockTransaction: 'S.W',
  Scale: 'SCL',
  TimeOrder: 'TMO',
  TrailingStop: 'TS',
  Work: 'WRK',
  PhoneSimple: 'A',
  PhoneComplex: 'B',
  FcmProvidedScreen: 'C',
  OtherProvidedScreen: 'D',
  ClientProvidedPlatformControlledByFcm: 'E',
  ClientProvidedPlatformDirectToExchange: 'F',
  AlgoEngine: 'H',
  PriceAtExecution: 'J',
  DeskElectronic: 'W',
  DeskPit: 'X',
  ClientElectronic: 'Y',
  ClientPit: 'Z',
  ConditionalOrder: 'CND',
  DeliveryInstructionsCash: 'CSH',
  DiscretionaryLimitOrder: 'DLO',
  IntraDayCross: 'IDX',
  IntermarketSweepOrder: 'ISO',
  MergerRelatedTransferPosition: 'MPT',
  MarketToLimit: 'MTL',
  DeliveryInstructionsNextDay: 'ND',
  OptionsRelatedTransaction: 'OPT',
  DeliveryInstructionsSellersOption: 'SLR',
  StayOnOfferside: 'F0',
  GoAlong: 'F3',
  ParticipateDoNotInitiate: 'F6',
  StrictScale: 'F7',
  TryToScale: 'F8',
  StayOnBidside: 'F9',
  NoCross: 'FA',
  OkToCross: 'FB',
  CallFirst: 'FC',
  PercentOfVolume: 'FD',
  ReinstateOnSystemFailure: 'FH',
  InstitutionOnly: 'FI',
  ReinstateOnTradingHalt: 'FJ',
  CancelOnTradingHalf: 'FK',
  LastPeg: 'FL',
  MidPricePeg: 'FM',
  NonNegotiable: 'FN',
  OpeningPeg: 'FO',
  MarketPeg: 'FP',
  CancelOnSystemFailure: 'FQ',
  PrimaryPeg: 'FR',
  Suspend: 'FS',
  FixedPegToLocalBbo: 'FT',
  PegToVwap: 'FW',
  TradeAlong: 'FX',
  TryToStop: 'FY',
  CancelIfNotBest: 'FZ',
  StrictLimit: 'Fb',
  IgnorePriceValidityChecks: 'Fc',
  PegToLimitPrice: 'Fd',
  WorkToTargetStrategy: 'Fe',
  GOrderAndFcmapIorFix: 'G',
} as const);

/** `CustomerOrFirm` values (`FIX::CustomerOrFirm_*`). */
export const CustomerOrFirm = /* @__PURE__ */ Object.freeze({
  Customer: '0',
  Firm: '1',
} as const);

/** `CustomerPriority` values (`FIX::CustomerPriority_*`). */
export const CustomerPriority = /* @__PURE__ */ Object.freeze({
  NoPriority: '0',
  UnconditionalPriority: '1',
} as const);

/** `CxlRejReason` values (`FIX::CxlRejReason_*`). */
export const CxlRejReason = /* @__PURE__ */ Object.freeze({
  TooLateToCancel: '0',
  UnknownOrder: '1',
  BrokerCredit: '2',
  OrderAlreadyInPendingStatus: '3',
  DuplicateClOrdId: '6',
  OrigOrdModTime: '5',
  UnableToProcessOrderMassCancelRequest: '4',
  Other: '99',
  InvalidPriceIncrement: '18',
  PriceExceedsCurrentPrice: '7',
  PriceExceedsCurrentPriceBand: '8',
} as const);

/** `CxlRejResponseTo` values (`FIX::CxlRejResponseTo_*`). */
export const CxlRejResponseTo = /* @__PURE__ */ Object.freeze({
  OrderCancelRequest: '1',
  OrderCancel: '2',
  OrderCancelReplaceRequest: '2',
} as const);

/** `CxlType` values (`FIX::CxlType_*`). */
export const CxlType = /* @__PURE__ */ Object.freeze({
  FullRemainingQuantity: 'F',
  PartialCancel: 'P',
} as const);

/** `DKReason` values (`FIX::DKReason_*`). */
export const DKReason = /* @__PURE__ */ Object.freeze({
  UnknownSymbol: 'A',
  WrongSide: 'B',
  QuantityExceedsOrder: 'C',
  NoMatchingOrder: 'D',
  PriceExceedsLimit: 'E',
  Other: 'Z',
  CalculationDifference: 'F',
  NoMatchingExecutionReport: 'G',
} as const);

/** `DateRollConvention` values (`FIX::DateRollConvention_*`). */
export const DateRollConvention = /* @__PURE__ */ Object.freeze({
  FirstDay: '1',
  SecondDay: '2',
  ThirdDay: '3',
  FourthDay: '4',
  FifthDay: '5',
  SixthDay: '6',
  SeventhDay: '7',
  EighthDay: '8',
  NinthDay: '9',
  TenthDay: '10',
  EleventhDay: '11',
  TwelvthDay: '12',
  ThirteenthDay: '13',
  ForteenthDay: '14',
  FifteenthDay: '15',
  SixteenthDay: '16',
  SeventeenthDay: '17',
  EighteenthDay: '18',
  NineteenthDay: '19',
  TwentiethDay: '20',
  TwentyFirstDay: '21',
  TwentySecondDay: '22',
  TwentyThirdDay: '23',
  TwentyFourthDay: '24',
  TwentyFifthDay: '25',
  TwentySixthDay: '26',
  TwentySeventhDay: '27',
  TwentyEigthDa28y: '28',
  TwentyNinthDay: '29',
  ThirtiethDay: '30',
  Eom: 'EOM',
  Frn: 'FRN',
  Imm: 'IMM',
  Immcad: 'IMMCAD',
  Immaud: 'IMMAUD',
  Immnzd: 'IMMNZD',
  Sfe: 'SFE',
  None: 'NONE',
  Tbill: 'TBILL',
  Mon: 'MON',
  Tue: 'TUE',
  Wed: 'WED',
  Thu: 'THU',
  Fri: 'FRI',
  Sat: 'SAT',
  Sun: 'SUN',
} as const);

/** `DayBookingInst` values (`FIX::DayBookingInst_*`). */
export const DayBookingInst = /* @__PURE__ */ Object.freeze({
  Auto: '0',
  SpeakWithOrderInitiatorBeforeBooking: '1',
  Accumulate: '2',
} as const);

/** `DealingCapacity` values (`FIX::DealingCapacity_*`). */
export const DealingCapacity = /* @__PURE__ */ Object.freeze({
  Agent: 'A',
  Principal: 'P',
  RisklessPrincipal: 'R',
} as const);

/** `DeleteReason` values (`FIX::DeleteReason_*`). */
export const DeleteReason = /* @__PURE__ */ Object.freeze({
  Cancellation: '0',
  Error: '1',
} as const);

/** `DeliveryForm` values (`FIX::DeliveryForm_*`). */
export const DeliveryForm = /* @__PURE__ */ Object.freeze({
  BookEntry: '1',
  Bearer: '2',
} as const);

/** `DeliveryScheduleSettlDay` values (`FIX::DeliveryScheduleSettlDay_*`). */
export const DeliveryScheduleSettlDay = /* @__PURE__ */ Object.freeze({
  Monday: '1',
  Tuesday: '2',
  Wednesday: '3',
  Thursday: '4',
  Friday: '5',
  Saturday: '6',
  Sunday: '7',
  AllWeekdays: '8',
  AllDays: '9',
  AllWeekends: '10',
} as const);

/** `DeliveryScheduleSettlFlowType` values (`FIX::DeliveryScheduleSettlFlowType_*`). */
export const DeliveryScheduleSettlFlowType = /* @__PURE__ */ Object.freeze({
  AllTimes: '0',
  OnPeak: '1',
  OffPeak: '2',
  Base: '3',
  BlockHours: '4',
  Other: '5',
} as const);

/** `DeliveryScheduleSettlHolidaysProcessingInstruction` values (`FIX::DeliveryScheduleSettlHolidaysProcessingInstruction_*`). */
export const DeliveryScheduleSettlHolidaysProcessingInstruction = /* @__PURE__ */ Object.freeze({
  DoNotIncludeHolidays: '0',
  IncludeHolidays: '1',
} as const);

/** `DeliveryScheduleSettlTimeType` values (`FIX::DeliveryScheduleSettlTimeType_*`). */
export const DeliveryScheduleSettlTimeType = /* @__PURE__ */ Object.freeze({
  Hour: '0',
  Timestamp: '1',
} as const);

/** `DeliveryScheduleToleranceType` values (`FIX::DeliveryScheduleToleranceType_*`). */
export const DeliveryScheduleToleranceType = /* @__PURE__ */ Object.freeze({
  Absolute: '0',
  Percentage: '1',
} as const);

/** `DeliveryScheduleType` values (`FIX::DeliveryScheduleType_*`). */
export const DeliveryScheduleType = /* @__PURE__ */ Object.freeze({
  Notional: '0',
  Delivery: '1',
  PhysicalSettlPeriods: '2',
} as const);

/** `DeliveryStreamDeliveryPointSource` values (`FIX::DeliveryStreamDeliveryPointSource_*`). */
export const DeliveryStreamDeliveryPointSource = /* @__PURE__ */ Object.freeze({
  Proprietary: '0',
  Eic: '1',
} as const);

/** `DeliveryStreamDeliveryRestriction` values (`FIX::DeliveryStreamDeliveryRestriction_*`). */
export const DeliveryStreamDeliveryRestriction = /* @__PURE__ */ Object.freeze({
  Firm: '1',
  NonFirm: '2',
  ForceMajeure: '3',
  SystemFirm: '4',
  UnitFirm: '5',
} as const);

/** `DeliveryStreamElectingPartySide` values (`FIX::DeliveryStreamElectingPartySide_*`). */
export const DeliveryStreamElectingPartySide = /* @__PURE__ */ Object.freeze({
  Buyer: '0',
  Seller: '1',
} as const);

/** `DeliveryStreamTitleTransferCondition` values (`FIX::DeliveryStreamTitleTransferCondition_*`). */
export const DeliveryStreamTitleTransferCondition = /* @__PURE__ */ Object.freeze({
  Transfers: '0',
  DoesNotTransfer: '1',
} as const);

/** `DeliveryStreamToleranceOptionSide` values (`FIX::DeliveryStreamToleranceOptionSide_*`). */
export const DeliveryStreamToleranceOptionSide = /* @__PURE__ */ Object.freeze({
  Buyer: '1',
  Seller: '2',
} as const);

/** `DeliveryStreamType` values (`FIX::DeliveryStreamType_*`). */
export const DeliveryStreamType = /* @__PURE__ */ Object.freeze({
  Periodic: '0',
  Initial: '1',
  Single: '2',
} as const);

/** `DeliveryType` values (`FIX::DeliveryType_*`). */
export const DeliveryType = /* @__PURE__ */ Object.freeze({
  VersusPayment: '0',
  Free: '1',
  TriParty: '2',
  HoldInCustody: '3',
  DeliverByValue: '4',
} as const);

/** `DeskOrderHandlingInst` values (`FIX::DeskOrderHandlingInst_*`). */
export const DeskOrderHandlingInst = /* @__PURE__ */ Object.freeze({
  AddOnOrder: 'ADD',
  AllOrNone: 'AON',
  CashNotHeld: 'CNH',
  DirectedOrder: 'DIR',
  ExchangeForPhysicalTransaction: 'E.W',
  FillOrKill: 'FOK',
  ImbalanceOnly: 'IO',
  ImmediateOrCancel: 'IOC',
  LimitOnOpen: 'LOO',
  LimitOnClose: 'LOC',
  MarketAtOpen: 'MAO',
  MarketAtClose: 'MAC',
  MarketOnOpen: 'MOO',
  MarketOnClose: 'MOC',
  MinimumQuantity: 'MQT',
  NotHeld: 'NH',
  OverTheDay: 'OVD',
  Pegged: 'PEG',
  ReserveSizeOrder: 'RSV',
  StopStockTransaction: 'S.W',
  Scale: 'SCL',
  TimeOrder: 'TMO',
  TrailingStop: 'TS',
  Work: 'WRK',
} as const);

/** `DeskType` values (`FIX::DeskType_*`). */
export const DeskType = /* @__PURE__ */ Object.freeze({
  Agency: 'A',
  Arbitrage: 'AR',
  Derivatives: 'D',
  International: 'IN',
  Institutional: 'IS',
  Other: 'O',
  PreferredTrading: 'PF',
  Proprietary: 'PR',
  ProgramTrading: 'PT',
  Sales: 'S',
  Trading: 'T',
  BlockTrading: 'B',
  ConvertibleDesk: 'C',
  CentralRiskBooks: 'CR',
  EquityCapitalMarkets: 'EC',
  Swaps: 'SW',
  TradingDeskSystem: 'T',
  Treasury: 'TR',
  FloorBroker: 'FB',
} as const);

/** `DeskTypeSource` values (`FIX::DeskTypeSource_*`). */
export const DeskTypeSource = /* @__PURE__ */ Object.freeze({
  Nasdoats: '1',
  Finraoats: '1',
} as const);

/** `DisclosureInstruction` values (`FIX::DisclosureInstruction_*`). */
export const DisclosureInstruction = /* @__PURE__ */ Object.freeze({
  No: '0',
  Yes: '1',
  UseDefaultSetting: '2',
} as const);

/** `DisclosureType` values (`FIX::DisclosureType_*`). */
export const DisclosureType = /* @__PURE__ */ Object.freeze({
  Volume: '1',
  Price: '2',
  Side: '3',
  Aon: '4',
  General: '5',
  ClearingAccount: '6',
  CmtaAccount: '7',
} as const);

/** `DiscretionInst` values (`FIX::DiscretionInst_*`). */
export const DiscretionInst = /* @__PURE__ */ Object.freeze({
  RelatedToDisplayedPrice: '0',
  RelatedToMarketPrice: '1',
  RelatedToPrimaryPrice: '2',
  RelatedToLocalPrimaryPrice: '3',
  RelatedToMidpointPrice: '4',
  RelatedToLastTradePrice: '5',
  RelatedToVwap: '6',
  AveragePriceGuarantee: '7',
} as const);

/** `DiscretionLimitType` values (`FIX::DiscretionLimitType_*`). */
export const DiscretionLimitType = /* @__PURE__ */ Object.freeze({
  OrBetter: '0',
  Strict: '1',
  OrWorse: '2',
} as const);

/** `DiscretionMoveType` values (`FIX::DiscretionMoveType_*`). */
export const DiscretionMoveType = /* @__PURE__ */ Object.freeze({
  Floating: '0',
  Fixed: '1',
} as const);

/** `DiscretionOffsetType` values (`FIX::DiscretionOffsetType_*`). */
export const DiscretionOffsetType = /* @__PURE__ */ Object.freeze({
  Price: '0',
  BasisPoints: '1',
  Ticks: '2',
  PriceTier: '3',
} as const);

/** `DiscretionRoundDirection` values (`FIX::DiscretionRoundDirection_*`). */
export const DiscretionRoundDirection = /* @__PURE__ */ Object.freeze({
  MoreAggressive: '1',
  MorePassive: '2',
} as const);

/** `DiscretionScope` values (`FIX::DiscretionScope_*`). */
export const DiscretionScope = /* @__PURE__ */ Object.freeze({
  Local: '1',
  National: '2',
  Global: '3',
  NationalExcludingLocal: '4',
} as const);

/** `DisplayMethod` values (`FIX::DisplayMethod_*`). */
export const DisplayMethod = /* @__PURE__ */ Object.freeze({
  Initial: '1',
  New: '2',
  Random: '3',
  Undisclosed: '4',
} as const);

/** `DisplayWhen` values (`FIX::DisplayWhen_*`). */
export const DisplayWhen = /* @__PURE__ */ Object.freeze({
  Immediate: '1',
  Exhaust: '2',
} as const);

/** `DistribPaymentMethod` values (`FIX::DistribPaymentMethod_*`). */
export const DistribPaymentMethod = /* @__PURE__ */ Object.freeze({
  Crest: '1',
  Nscc: '2',
  Euroclear: '3',
  Clearstream: '4',
  Cheque: '5',
  TelegraphicTransfer: '6',
  FedWire: '7',
  DirectCredit: '8',
  AchCredit: '9',
  Bpay: '10',
  HighValueClearingSystemHvacs: '11',
  ReinvestInFund: '12',
  Other: '999',
} as const);

/** `DividendAmountType` values (`FIX::DividendAmountType_*`). */
export const DividendAmountType = /* @__PURE__ */ Object.freeze({
  RecordAmount: '0',
  ExAmount: '1',
  PaidAmount: '2',
  PerMasterConfirm: '3',
} as const);

/** `DividendComposition` values (`FIX::DividendComposition_*`). */
export const DividendComposition = /* @__PURE__ */ Object.freeze({
  EquityAmountReceiver: '0',
  CalculationAgent: '1',
} as const);

/** `DividendEntitlementEvent` values (`FIX::DividendEntitlementEvent_*`). */
export const DividendEntitlementEvent = /* @__PURE__ */ Object.freeze({
  ExDate: '0',
  RecordDate: '1',
} as const);

/** `DlvyInstType` values (`FIX::DlvyInstType_*`). */
export const DlvyInstType = /* @__PURE__ */ Object.freeze({
  Securities: 'S',
  Cash: 'C',
} as const);

/** `DueToRelated` values (`FIX::DueToRelated_*`). */
export const DueToRelated = /* @__PURE__ */ Object.freeze({
  No: 'N',
  Yes: 'Y',
} as const);

/** `DuplicateClOrdIDIndicator` values (`FIX::DuplicateClOrdIDIndicator_*`). */
export const DuplicateClOrdIDIndicator = /* @__PURE__ */ Object.freeze({
  No: 'N',
  Yes: 'Y',
} as const);

/** `EmailType` values (`FIX::EmailType_*`). */
export const EmailType = /* @__PURE__ */ Object.freeze({
  New: '0',
  Reply: '1',
  AdminReply: '2',
} as const);

/** `EncryptMethod` values (`FIX::EncryptMethod_*`). */
export const EncryptMethod = /* @__PURE__ */ Object.freeze({
  NoneOther: '0',
  Pkcs: '1',
  Des: '2',
  Pkcsdes: '3',
  Pgpdes: '4',
  Pgpdesmd5: '5',
  Pemdesmd5: '6',
  None: '0',
  Pem: '6',
} as const);

/** `EntitlementAttribDatatype` values (`FIX::EntitlementAttribDatatype_*`). */
export const EntitlementAttribDatatype = /* @__PURE__ */ Object.freeze({
  Tenor: '29',
  Pattern: '32',
  Reserved100Plus: '33',
  Reserved1000Plus: '34',
  Reserved4000Plus: '35',
  String: '14',
  MultipleCharValue: '15',
  Currency: '16',
  Exchange: '17',
  MonthYear: '18',
  UtcTimestamp: '19',
  UtcTimeOnly: '20',
  LocalMktDate: '21',
  UtcDateOnly: '22',
  Data: '23',
  MultipleStringValue: '24',
  Country: '25',
  Language: '26',
  TzTimeOnly: '27',
  TzTimestamp: '28',
  XmlData: '31',
  Char: '12',
  Boolean: '13',
  Float: '6',
  Qty: '7',
  Price: '8',
  PriceOffset: '9',
  Amt: '10',
  Percentage: '11',
  Int: '1',
  Length: '2',
  NumInGroup: '3',
  SeqNum: '4',
  TagNum: '5',
  DayOfMonth: '30',
} as const);

/** `EntitlementRequestResult` values (`FIX::EntitlementRequestResult_*`). */
export const EntitlementRequestResult = /* @__PURE__ */ Object.freeze({
  Successful: '0',
  InvalidParty: '1',
  InvalidRelatedParty: '2',
  InvalidEntitlementType: '3',
  InvalidEntitlementId: '4',
  InvalidEntitlementAttribute: '5',
  InvalidInstrumentScope: '6',
  InvalidMarketSegmentScope: '7',
  InvalidStartDate: '8',
  InvalidEndDate: '9',
  InstrumentScopeNotSupported: '10',
  MarketSegmentScopeNotSupported: '11',
  EntitlementNotApprovedForParty: '12',
  EntitlementAlreadyDefinedForParty: '13',
  InstrumentNotApprovedForParty: '14',
  NotAuthorized: '98',
  Other: '99',
} as const);

/** `EntitlementStatus` values (`FIX::EntitlementStatus_*`). */
export const EntitlementStatus = /* @__PURE__ */ Object.freeze({
  Accepted: '0',
  AcceptedWithChanges: '1',
  Rejected: '2',
  Pending: '3',
  Requested: '4',
  Deferred: '5',
} as const);

/** `EntitlementSubType` values (`FIX::EntitlementSubType_*`). */
export const EntitlementSubType = /* @__PURE__ */ Object.freeze({
  OrderEntry: '1',
  HItLift: '2',
  ViewIndicativePx: '3',
  ViewExecutablePx: '4',
  SingleQuote: '5',
  StreamingQuotes: '6',
  SingleBroker: '7',
  MultiBrokers: '8',
} as const);

/** `EntitlementType` values (`FIX::EntitlementType_*`). */
export const EntitlementType = /* @__PURE__ */ Object.freeze({
  Trade: '0',
  MakeMarkets: '1',
  HoldPositions: '2',
  PerformGiveUps: '3',
  SubmitIoIs: '4',
  SubscribeMarketData: '5',
  ShortWithPreBorrow: '6',
  SubmitQuoteRequests: '7',
  RespondToQuoteRequests: '8',
} as const);

/** `EventInitiatorType` values (`FIX::EventInitiatorType_*`). */
export const EventInitiatorType = /* @__PURE__ */ Object.freeze({
  CustomerOrClient: 'C',
  ExchangeOrExecutionVenue: 'E',
  FirmOrBroker: 'F',
} as const);

/** `EventTimeUnit` values (`FIX::EventTimeUnit_*`). */
export const EventTimeUnit = /* @__PURE__ */ Object.freeze({
  Hour: 'H',
  Minute: 'Min',
  Second: 'S',
  Day: 'D',
  Week: 'Wk',
  Month: 'Mo',
  Year: 'Yr',
} as const);

/** `EventType` values (`FIX::EventType_*`). */
export const EventType = /* @__PURE__ */ Object.freeze({
  Put: '1',
  Call: '2',
  Tender: '3',
  SinkingFundCall: '4',
  Other: '99',
  Activation: '5',
  Inactiviation: '6',
  LastEligibleTradeDate: '7',
  SwapStartDate: '8',
  SwapEndDate: '9',
  SwapRollDate: '10',
  SwapNextStartDate: '11',
  SwapNextRollDate: '12',
  FirstDeliveryDate: '13',
  LastDeliveryDate: '14',
  InitialInventoryDueDate: '15',
  FinalInventoryDueDate: '16',
  FirstIntentDate: '17',
  LastIntentDate: '18',
  PositionRemovalDate: '19',
  MinimumNotice: '20',
  DeliveryStartTime: '21',
  DeliveryEndTime: '22',
  FirstNoticeDate: '23',
  LastNoticeDate: '24',
  FirstExerciseDate: '25',
  RedemptionDate: '26',
  TrdCntntnEfctvDt: '27',
} as const);

/** `ExDestination` values (`FIX::ExDestination_*`). */
export const ExDestination = /* @__PURE__ */ Object.freeze({
  None: '0',
  Posit: '4',
} as const);

/** `ExDestinationIDSource` values (`FIX::ExDestinationIDSource_*`). */
export const ExDestinationIDSource = /* @__PURE__ */ Object.freeze({
  Bic: 'B',
  GeneralIdentifier: 'C',
  Proprietary: 'D',
  IsoCountryCode: 'E',
  Mic: 'G',
} as const);

/** `ExDestinationType` values (`FIX::ExDestinationType_*`). */
export const ExDestinationType = /* @__PURE__ */ Object.freeze({
  NoRestriction: '0',
  TradedOnlyOnTradingVenue: '1',
  TradedOnlyOnSi: '2',
  TradedOnTradingVenueOrSi: '3',
} as const);

/** `ExchangeForPhysical` values (`FIX::ExchangeForPhysical_*`). */
export const ExchangeForPhysical = /* @__PURE__ */ Object.freeze({
  No: 'N',
  Yes: 'Y',
} as const);

/** `ExecAckStatus` values (`FIX::ExecAckStatus_*`). */
export const ExecAckStatus = /* @__PURE__ */ Object.freeze({
  Received: '0',
  Accepted: '1',
  Don: '2',
  DontKnow: '2',
} as const);

/** `ExecInst` values (`FIX::ExecInst_*`). */
export const ExecInst = /* @__PURE__ */ Object.freeze({
  StayOnOfferSide: '0',
  NotHeld: '1',
  Work: '2',
  GoAlong: '3',
  OverTheDay: '4',
  Held: '5',
  ParticipateDoNotInitiate: '6',
  StrictScale: '7',
  TryToScale: '8',
  StayOnBidSide: '9',
  NoCross: 'A',
  OkToCross: 'B',
  CallFirst: 'C',
  PercentOfVolume: 'D',
  DoNotIncrease: 'E',
  DoNotReduce: 'F',
  AllOrNone: 'G',
  InstitutionsOnly: 'I',
  LastPeg: 'L',
  MidPricePeg: 'M',
  NonNegotiable: 'N',
  OpeningPeg: 'O',
  MarketPeg: 'P',
  PrimaryPeg: 'R',
  Suspend: 'S',
  CustomerDisplayInstruction: 'U',
  Netting: 'V',
  FixedPegToLocalBestBidOrOfferAtTimeOfOrder: 'T',
  PegToVwap: 'W',
  TryToStop: 'Y',
  CancelOnSystemFailure: 'Q',
  TradeAlong: 'X',
  ReinstateOnSystemFailure: 'H',
  ReinstateOnTradingHalt: 'J',
  CancelOnTradingHalt: 'K',
  CancelIfNotBest: 'Z',
  TrailingStopPeg: 'a',
  StrictLimit: 'b',
  IgnorePriceValidityChecks: 'c',
  PegToLimitPrice: 'd',
  WorkToTargetStrategy: 'e',
  IntermarketSweep: 'f',
  ExternalRoutingAllowed: 'g',
  ExternalRoutingNotAllowed: 'h',
  ImbalanceOnly: 'i',
  SingleExecutionRequestedForBlockTrade: 'j',
  BestExecution: 'k',
  SuspendOnSystemFailure: 'l',
  SuspendOnTradingHalt: 'm',
  ReinstateOnConnectionLoss: 'n',
  CancelOnConnectionLoss: 'o',
  SuspendOnConnectionLoss: 'p',
  ReleaseFromSuspension: 'q',
  ExecuteAsDeltaNeutral: 'r',
  ExecuteAsDurationNeutral: 's',
  ExecuteAsFxNeutral: 't',
  Release: 'q',
  MinGuaranteedFillEligible: 'u',
  BypassNonDisplayLiquidity: 'v',
  Lock: 'w',
  IgnoreNotionalValueChecks: 'x',
  TrdAtRefPx: 'y',
  AllowFacilitation: 'z',
} as const);

/** `ExecMethod` values (`FIX::ExecMethod_*`). */
export const ExecMethod = /* @__PURE__ */ Object.freeze({
  Unspecified: '0',
  Manual: '1',
  Automated: '2',
  VoiceBrokered: '3',
} as const);

/** `ExecPriceType` values (`FIX::ExecPriceType_*`). */
export const ExecPriceType = /* @__PURE__ */ Object.freeze({
  SinglePrice: 'S',
  OfferPriceMinusAdjustmentAmount: 'Q',
  OfferPriceMinusAdjustmentPercent: 'P',
  OfferPrice: 'O',
  CreationPricePlusAdjustmentAmount: 'E',
  CreationPricePlusAdjustmentPercent: 'D',
  CreationPrice: 'C',
  BidPrice: 'B',
} as const);

/** `ExecRestatementReason` values (`FIX::ExecRestatementReason_*`). */
export const ExecRestatementReason = /* @__PURE__ */ Object.freeze({
  GtCorporateAction: '0',
  GtRenewal: '1',
  VerbalChange: '2',
  RepricingOfOrder: '3',
  BrokerOption: '4',
  PartialDeclineOfOrderQty: '5',
  CancelOnSystemFailure: '7',
  Market: '8',
  CancelOnTradingHalt: '6',
  Canceled: '9',
  WarehouseRecap: '10',
  Other: '99',
  PegRefresh: '11',
  CancelOnConnectionLoss: '12',
  CancelOnLogout: '13',
  AssignTimePriority: '14',
  CancelledForTradePriceViolation: '15',
  CancelledForCrossImbalance: '16',
  CxldSmp: '17',
  CxldSmpAggressive: '18',
  CxldSmpPassive: '19',
  CxldSmpAggressivePassive: '20',
} as const);

/** `ExecTransType` values (`FIX::ExecTransType_*`). */
export const ExecTransType = /* @__PURE__ */ Object.freeze({
  New: '0',
  Cancel: '1',
  Correct: '2',
  Status: '3',
} as const);

/** `ExecType` values (`FIX::ExecType_*`). */
export const ExecType = /* @__PURE__ */ Object.freeze({
  New: '0',
  PartialFill: '1',
  Fill: '2',
  DoneForDay: '3',
  Canceled: '4',
  Replaced: '5',
  PendingCancel: '6',
  Stopped: '7',
  Rejected: '8',
  Suspended: '9',
  PendingNew: 'A',
  Calculated: 'B',
  Expired: 'C',
  Restated: 'D',
  PendingReplace: 'E',
  Trade: 'F',
  TradeCorrect: 'G',
  TradeCancel: 'H',
  OrderStatus: 'I',
  TradeInAClearingHold: 'J',
  TradeHasBeenReleasedToClearing: 'K',
  TriggeredOrActivatedBySystem: 'L',
  Locked: 'M',
  Released: 'N',
} as const);

/** `ExecTypeReason` values (`FIX::ExecTypeReason_*`). */
export const ExecTypeReason = /* @__PURE__ */ Object.freeze({
  OrdAddedOnRequest: '1',
  OrdReplacedOnRequest: '2',
  OrdCxldOnRequest: '3',
  UnsolicitedOrdCxl: '4',
  NonRestingOrdAddedOnRequest: '5',
  OrdReplacedWithNonRestingOrdOnRequest: '6',
  TriggerOrdReplacedOnRequest: '7',
  SuspendedOrdReplacedOnRequest: '8',
  SuspendedOrdCxldOnRequest: '9',
  OrdCxlPending: '10',
  PendingCxlExecuted: '11',
  RestingOrdTriggered: '12',
  SuspendedOrdActivated: '13',
  ActiveOrdSuspended: '14',
  OrdExpired: '15',
} as const);

/** `ExerciseConfirmationMethod` values (`FIX::ExerciseConfirmationMethod_*`). */
export const ExerciseConfirmationMethod = /* @__PURE__ */ Object.freeze({
  NotRequired: '0',
  NonElectronic: '1',
  Electronic: '2',
  Unknown: '3',
} as const);

/** `ExerciseMethod` values (`FIX::ExerciseMethod_*`). */
export const ExerciseMethod = /* @__PURE__ */ Object.freeze({
  Automatic: 'A',
  Manual: 'M',
} as const);

/** `ExerciseStyle` values (`FIX::ExerciseStyle_*`). */
export const ExerciseStyle = /* @__PURE__ */ Object.freeze({
  European: '0',
  American: '1',
  Bermuda: '2',
  Other: '99',
} as const);

/** `ExpType` values (`FIX::ExpType_*`). */
export const ExpType = /* @__PURE__ */ Object.freeze({
  AutoExercise: '1',
  NonAutoExercise: '2',
  FinalWillBeExercised: '3',
  ContraryIntention: '4',
  Difference: '5',
} as const);

/** `ExpirationCycle` values (`FIX::ExpirationCycle_*`). */
export const ExpirationCycle = /* @__PURE__ */ Object.freeze({
  ExpireOnTradingSessionClose: '0',
  ExpireOnTradingSessionOpen: '1',
  SpecifiedExpiration: '2',
} as const);

/** `ExpirationQtyType` values (`FIX::ExpirationQtyType_*`). */
export const ExpirationQtyType = /* @__PURE__ */ Object.freeze({
  AutoExercise: '1',
  NonAutoExercise: '2',
  FinalWillBeExercised: '3',
  ContraryIntention: '4',
  Difference: '5',
} as const);

/** `ExtraordinaryEventAdjustmentMethod` values (`FIX::ExtraordinaryEventAdjustmentMethod_*`). */
export const ExtraordinaryEventAdjustmentMethod = /* @__PURE__ */ Object.freeze({
  CalculationAgent: '0',
  OptionsExchange: '1',
} as const);

/** `FinancialStatus` values (`FIX::FinancialStatus_*`). */
export const FinancialStatus = /* @__PURE__ */ Object.freeze({
  Bankrupt: '1',
  PendingDelisting: '2',
  Restricted: '3',
} as const);

/** `FlowScheduleType` values (`FIX::FlowScheduleType_*`). */
export const FlowScheduleType = /* @__PURE__ */ Object.freeze({
  NercEasternOffPeak: '0',
  NercWesternOffPeak: '1',
  NercCalendarAllDaysInMonth: '2',
  NercEasternPeak: '3',
  NercWesternPeak: '4',
  AllTimes: '5',
  OnPeak: '6',
  OffPeak: '7',
  Base: '8',
  Block: '9',
  Other: '99',
} as const);

/** `ForexReq` values (`FIX::ForexReq_*`). */
export const ForexReq = /* @__PURE__ */ Object.freeze({
  No: 'N',
  Yes: 'Y',
} as const);

/** `FundRenewWaiv` values (`FIX::FundRenewWaiv_*`). */
export const FundRenewWaiv = /* @__PURE__ */ Object.freeze({
  No: 'N',
  Yes: 'Y',
} as const);

/** `FundingSource` values (`FIX::FundingSource_*`). */
export const FundingSource = /* @__PURE__ */ Object.freeze({
  Repo: '0',
  Cash: '1',
  FreeCedits: '2',
  CustomerShortSales: '3',
  BrokerShortSales: '4',
  UnsecuredBorrowing: '5',
  Other: '99',
} as const);

/** `FuturesValuationMethod` values (`FIX::FuturesValuationMethod_*`). */
export const FuturesValuationMethod = /* @__PURE__ */ Object.freeze({
  PremiumStyle: 'EQTY',
  FuturesStyleMarkToMarket: 'FUT',
  FuturesStyleWithAnAttachedCashAdjustment: 'FUTDA',
} as const);

/** `GTBookingInst` values (`FIX::GTBookingInst_*`). */
export const GTBookingInst = /* @__PURE__ */ Object.freeze({
  BookOutAllTradesOnDayOfExecution: '0',
  AccumulateUntilFilledOrExpired: '1',
  AccumulateUntilVerballlyNotifiedOtherwise: '2',
  AccumulateUntilVerballyNotifiedOtherwise: '2',
} as const);

/** `GapFillFlag` values (`FIX::GapFillFlag_*`). */
export const GapFillFlag = /* @__PURE__ */ Object.freeze({
  No: 'N',
  Yes: 'Y',
} as const);

/** `HaltReasonChar` values (`FIX::HaltReasonChar_*`). */
export const HaltReasonChar = /* @__PURE__ */ Object.freeze({
  NewsDissemination: 'D',
  OrderInflux: 'E',
  OrderImbalance: 'I',
  AdditionalInformation: 'M',
  NewsPending: 'P',
  EquipmentChangeover: 'X',
  NewPending: 'P',
} as const);

/** `HaltReasonInt` values (`FIX::HaltReasonInt_*`). */
export const HaltReasonInt = /* @__PURE__ */ Object.freeze({
  NewsDissemination: '0',
  OrderInflux: '1',
  OrderImbalance: '2',
  AdditionalInformation: '3',
  NewsPending: '4',
  EquipmentChangeover: '5',
} as const);

/** `HandlInst` values (`FIX::HandlInst_*`). */
export const HandlInst = /* @__PURE__ */ Object.freeze({
  AutomatedExecutionNoIntervention: '1',
  AutomatedExecutionInterventionOk: '2',
  ManualOrder: '3',
} as const);

/** `IDSource` values (`FIX::IDSource_*`). */
export const IDSource = /* @__PURE__ */ Object.freeze({
  Cusip: '1',
  Sedol: '2',
  Quik: '3',
  IsinNumber: '4',
  RicCode: '5',
  IsoCurrencyCode: '6',
  IsoCountryCode: '7',
  ExchangeSymbol: '8',
  ConsolidatedTapeAssociation: '9',
} as const);

/** `IOINaturalFlag` values (`FIX::IOINaturalFlag_*`). */
export const IOINaturalFlag = /* @__PURE__ */ Object.freeze({
  No: 'N',
  Yes: 'Y',
} as const);

/** `IOIOthSvc` values (`FIX::IOIOthSvc_*`). */
export const IOIOthSvc = /* @__PURE__ */ Object.freeze({
  Autex: 'A',
  Bridge: 'B',
} as const);

/** `IOIQltyInd` values (`FIX::IOIQltyInd_*`). */
export const IOIQltyInd = /* @__PURE__ */ Object.freeze({
  High: 'H',
  Low: 'L',
  Medium: 'M',
} as const);

/** `IOIQty` values (`FIX::IOIQty_*`). */
export const IOIQty = /* @__PURE__ */ Object.freeze({
  Large: 'L',
  Medium: 'M',
  Small: 'S',
  UndisclosedQuantity: 'U',
} as const);

/** `IOIQualifier` values (`FIX::IOIQualifier_*`). */
export const IOIQualifier = /* @__PURE__ */ Object.freeze({
  AllOrNone: 'A',
  AtTheClose: 'C',
  InTouchWith: 'I',
  Limit: 'L',
  MoreBehind: 'M',
  AtTheOpen: 'O',
  TakingAPosition: 'P',
  AtTheMarket: 'Q',
  PortfolioShown: 'S',
  ThroughTheDay: 'T',
  Versus: 'V',
  Indication: 'W',
  CrossingOpportunity: 'X',
  AtTheMidpoint: 'Y',
  PreOpen: 'Z',
  ReadyToTrade: 'R',
  Vwap: 'D',
  MarketOnClose: 'B',
  Axe: 'E',
  AxeOnBid: 'F',
  AxeOnOffer: 'G',
  ClientNaturalWorking: 'H',
  PositionWanted: 'J',
  MarketMaking: 'K',
  ClientNaturalBlock: 'N',
  Unwind: 'U',
  QuantityNegotiable: '1',
  AllowLateBids: '2',
  ImmediateOrCounter: '3',
  AutoTrade: '4',
  AutomaticSpot: 'a',
  PlatformCalculatedSpot: 'b',
  OutsideSpread: 'c',
  DeferredSpot: 'd',
  NegotiatedSpot: 'n',
} as const);

/** `IOIShares` values (`FIX::IOIShares_*`). */
export const IOIShares = /* @__PURE__ */ Object.freeze({
  Large: 'L',
  Medium: 'M',
  Small: 'S',
} as const);

/** `IOITransType` values (`FIX::IOITransType_*`). */
export const IOITransType = /* @__PURE__ */ Object.freeze({
  Cancel: 'C',
  New: 'N',
  Replace: 'R',
} as const);

/** `IRSDirection` values (`FIX::IRSDirection_*`). */
export const IRSDirection = /* @__PURE__ */ Object.freeze({
  Pay: 'PAY',
  Rcv: 'RCV',
  Na: 'NA',
} as const);

/** `ImpliedMarketIndicator` values (`FIX::ImpliedMarketIndicator_*`). */
export const ImpliedMarketIndicator = /* @__PURE__ */ Object.freeze({
  NotImplied: '0',
  ImpliedIn: '1',
  ImpliedOut: '2',
  BothImpliedInAndImpliedOut: '3',
} as const);

/** `InTheMoneyCondition` values (`FIX::InTheMoneyCondition_*`). */
export const InTheMoneyCondition = /* @__PURE__ */ Object.freeze({
  StandardItm: '0',
  Atmitm: '1',
  AtmCallItm: '2',
  AtmPutItm: '3',
} as const);

/** `InViewOfCommon` values (`FIX::InViewOfCommon_*`). */
export const InViewOfCommon = /* @__PURE__ */ Object.freeze({
  No: 'N',
  Yes: 'Y',
} as const);

/** `IncTaxInd` values (`FIX::IncTaxInd_*`). */
export const IncTaxInd = /* @__PURE__ */ Object.freeze({
  Net: '1',
  Gross: '2',
} as const);

/** `IndividualAllocType` values (`FIX::IndividualAllocType_*`). */
export const IndividualAllocType = /* @__PURE__ */ Object.freeze({
  SubAllocate: '1',
  ThirdPartyAllocation: '2',
} as const);

/** `InstrAttribType` values (`FIX::InstrAttribType_*`). */
export const InstrAttribType = /* @__PURE__ */ Object.freeze({
  Flat: '1',
  ZeroCoupon: '2',
  InterestBearing: '3',
  NoPeriodicPayments: '4',
  VariableRate: '5',
  LessFeeForPut: '6',
  SteppedCoupon: '7',
  CouponPeriod: '8',
  When: '9',
  OriginalIssueDiscount: '10',
  Callable: '11',
  EscrowedToMaturity: '12',
  EscrowedToRedemptionDate: '13',
  PreRefunded: '14',
  InDefault: '15',
  Unrated: '16',
  Taxable: '17',
  Indexed: '18',
  SubjectToAlternativeMinimumTax: '19',
  OriginalIssueDiscountPrice: '20',
  CallableBelowMaturityValue: '21',
  CallableWithoutNotice: '22',
  Text: '99',
  PriceTickRulesForSecurity: '23',
  TradeTypeEligibilityDetailsForSecurity: '24',
  InstrumentDenominator: '25',
  InstrumentNumerator: '26',
  InstrumentPricePrecision: '27',
  InstrumentStrikePrice: '28',
  TradeableIndicator: '29',
  InstrumentEligibleAnonOrders: '30',
  MinGuaranteedFillVolume: '31',
  MinGuaranteedFillStatus: '32',
  TradeAtSettlementEligibility: '33',
  TestInstrument: '34',
  DummyInstrument: '35',
  NegativeSettlementPriceEligibility: '36',
  NegativeStrikePriceEligibility: '37',
  UsStdContractInd: '38',
  AdmittedToTradingOnTradingVenue: '39',
  AverageDailyNotionalAmount: '40',
  AverageDailyNumberTrades: '41',
} as const);

/** `InstrmtAssignmentMethod` values (`FIX::InstrmtAssignmentMethod_*`). */
export const InstrmtAssignmentMethod = /* @__PURE__ */ Object.freeze({
  Random: 'R',
  ProRata: 'P',
} as const);

/** `InstrumentScopeOperator` values (`FIX::InstrumentScopeOperator_*`). */
export const InstrumentScopeOperator = /* @__PURE__ */ Object.freeze({
  Include: '1',
  Exclude: '2',
} as const);

/** `LastCapacity` values (`FIX::LastCapacity_*`). */
export const LastCapacity = /* @__PURE__ */ Object.freeze({
  Agent: '1',
  CrossAsAgent: '2',
  CrossAsPrincipal: '3',
  Principal: '4',
  RisklessPrincipal: '5',
} as const);

/** `LastFragment` values (`FIX::LastFragment_*`). */
export const LastFragment = /* @__PURE__ */ Object.freeze({
  Yes: 'Y',
  No: 'N',
} as const);

/** `LastLiquidityInd` values (`FIX::LastLiquidityInd_*`). */
export const LastLiquidityInd = /* @__PURE__ */ Object.freeze({
  AddedLiquidity: '1',
  RemovedLiquidity: '2',
  LiquidityRoutedOut: '3',
  Auction: '4',
  NeitherAddedNorRemovedLiquidity: '0',
  TriggeredStopOrder: '5',
  TriggeredContingencyOrder: '6',
  TriggeredMarketOrder: '7',
  RemovedLiquidityAfterFirmOrderCommitment: '8',
  AuctionExecutionAfterFirmOrderCommitment: '9',
  Unknown: '10',
  Other: '11',
} as const);

/** `LastRptRequested` values (`FIX::LastRptRequested_*`). */
export const LastRptRequested = /* @__PURE__ */ Object.freeze({
  No: 'N',
  Yes: 'Y',
} as const);

/** `LegSwapType` values (`FIX::LegSwapType_*`). */
export const LegSwapType = /* @__PURE__ */ Object.freeze({
  ParForPar: '1',
  ModifiedDuration: '2',
  Risk: '4',
  Proceeds: '5',
} as const);

/** `LegalConfirm` values (`FIX::LegalConfirm_*`). */
export const LegalConfirm = /* @__PURE__ */ Object.freeze({
  Yes: 'Y',
  No: 'N',
} as const);

/** `LienSeniority` values (`FIX::LienSeniority_*`). */
export const LienSeniority = /* @__PURE__ */ Object.freeze({
  Unknown: '0',
  FirstLien: '1',
  SecondLien: '2',
  ThirdLien: '3',
} as const);

/** `LimitAmtType` values (`FIX::LimitAmtType_*`). */
export const LimitAmtType = /* @__PURE__ */ Object.freeze({
  CreditLimit: '0',
  GrossPositionLimit: '1',
  NetPositionLimit: '2',
  RiskExposureLimit: '3',
  LongPositionLimit: '4',
  ShortPositionLimit: '5',
} as const);

/** `LiquidityIndType` values (`FIX::LiquidityIndType_*`). */
export const LiquidityIndType = /* @__PURE__ */ Object.freeze({
  FiveDayMovingAverage: '1',
  TwentyDayMovingAverage: '2',
  NormalMarketSize: '3',
  Other: '4',
} as const);

/** `ListExecInstType` values (`FIX::ListExecInstType_*`). */
export const ListExecInstType = /* @__PURE__ */ Object.freeze({
  Immediate: '1',
  WaitForInstruction: '2',
  BuyDrivenCashWithdraw: '5',
  BuyDrivenCashTopUp: '4',
  SellDriven: '3',
} as const);

/** `ListMethod` values (`FIX::ListMethod_*`). */
export const ListMethod = /* @__PURE__ */ Object.freeze({
  PreListedOnly: '0',
  UserRequested: '1',
} as const);

/** `ListOrderStatus` values (`FIX::ListOrderStatus_*`). */
export const ListOrderStatus = /* @__PURE__ */ Object.freeze({
  Cancelling: '4',
  Executing: '3',
  Reject: '7',
  AllDone: '6',
  Alert: '5',
  ReceivedForExecution: '2',
  InBiddingProcess: '1',
} as const);

/** `ListRejectReason` values (`FIX::ListRejectReason_*`). */
export const ListRejectReason = /* @__PURE__ */ Object.freeze({
  BrokerCredit: '0',
  ExchangeClosed: '2',
  TooLateToEnter: '4',
  UnknownOrder: '5',
  DuplicateOrder: '6',
  UnsupportedOrderCharacteristic: '11',
  Other: '99',
} as const);

/** `ListStatusType` values (`FIX::ListStatusType_*`). */
export const ListStatusType = /* @__PURE__ */ Object.freeze({
  Alert: '6',
  ExecStarted: '4',
  Timed: '3',
  Response: '2',
  Ack: '1',
  AllDone: '5',
} as const);

/** `ListUpdateAction` values (`FIX::ListUpdateAction_*`). */
export const ListUpdateAction = /* @__PURE__ */ Object.freeze({
  Add: 'A',
  Delete: 'D',
  Modify: 'M',
  Snapshot: 'S',
} as const);

/** `LoanFacility` values (`FIX::LoanFacility_*`). */
export const LoanFacility = /* @__PURE__ */ Object.freeze({
  BridgeLoan: '0',
  LetterOfCredit: '1',
  RevolvingLoan: '2',
  SwinglineFunding: '3',
  TermLoan: '4',
  TradeClaim: '5',
} as const);

/** `LocateReqd` values (`FIX::LocateReqd_*`). */
export const LocateReqd = /* @__PURE__ */ Object.freeze({
  No: 'N',
  Yes: 'Y',
} as const);

/** `LockType` values (`FIX::LockType_*`). */
export const LockType = /* @__PURE__ */ Object.freeze({
  NotLocked: '0',
  AwayMarketNetter: '1',
  ThreeTickLocked: '2',
  LockedByMarketMaker: '3',
  DirectedOrderLock: '4',
  MultilegLock: '5',
  MarketOrderLock: '6',
  PreAssignmentLock: '7',
} as const);

/** `LotType` values (`FIX::LotType_*`). */
export const LotType = /* @__PURE__ */ Object.freeze({
  OddLot: '1',
  RoundLot: '2',
  BlockLot: '3',
  RoundLotBasedUpon: '4',
} as const);

/** `MDBookType` values (`FIX::MDBookType_*`). */
export const MDBookType = /* @__PURE__ */ Object.freeze({
  TopOfBook: '1',
  PriceDepth: '2',
  OrderDepth: '3',
} as const);

/** `MDEntryType` values (`FIX::MDEntryType_*`). */
export const MDEntryType = /* @__PURE__ */ Object.freeze({
  Bid: '0',
  Offer: '1',
  Trade: '2',
  IndexValue: '3',
  OpeningPrice: '4',
  ClosingPrice: '5',
  SettlementPrice: '6',
  TradingSessionHighPrice: '7',
  TradingSessionLowPrice: '8',
  TradingSessionVwapPrice: '9',
  Imbalance: 'A',
  TradeVolume: 'B',
  OpenInterest: 'C',
  CompositeUnderlyingPrice: 'D',
  SimulatedSellPrice: 'E',
  SimulatedBuyPrice: 'F',
  MarginRate: 'G',
  MidPrice: 'H',
  EmptyBook: 'J',
  SettleHighPrice: 'K',
  SettleLowPrice: 'L',
  PriorSettlePrice: 'M',
  SessionHighBid: 'N',
  SessionLowOffer: 'O',
  EarlyPrices: 'P',
  AuctionClearingPrice: 'Q',
  SwapValueFactor: 'S',
  DailyValueAdjustmentForLongPositions: 'R',
  CumulativeValueAdjustmentForLongPositions: 'T',
  DailyValueAdjustmentForShortPositions: 'U',
  CumulativeValueAdjustmentForShortPositions: 'V',
  Vwap: '9',
  FixingPrice: 'W',
  CashRate: 'X',
  RecoveryRate: 'Y',
  RecoveryRateForLong: 'Z',
  RecoveryRateForShort: 'a',
  MarketBid: 'b',
  MarketOffer: 'c',
  ShortSaleMinPrice: 'd',
  PreviousClosingPrice: 'e',
  ThresholdLimitPriceBanding: 'g',
  DailyFinancingValue: 'h',
  AccruedFinancingValue: 'i',
  Twap: 't',
} as const);

/** `MDImplicitDelete` values (`FIX::MDImplicitDelete_*`). */
export const MDImplicitDelete = /* @__PURE__ */ Object.freeze({
  Yes: 'Y',
  No: 'N',
} as const);

/** `MDOriginType` values (`FIX::MDOriginType_*`). */
export const MDOriginType = /* @__PURE__ */ Object.freeze({
  Book: '0',
  OffBook: '1',
  Cross: '2',
  QuoteDrivenMarket: '3',
  DarkOrderBook: '4',
  AuctionDrivenMarket: '5',
  QuoteNegotiation: '6',
  VoiceNegotiation: '7',
  HybridMarket: '8',
} as const);

/** `MDQuoteType` values (`FIX::MDQuoteType_*`). */
export const MDQuoteType = /* @__PURE__ */ Object.freeze({
  Indicative: '0',
  Tradeable: '1',
  RestrictedTradeable: '2',
  Counter: '3',
  IndicativeAndTradeable: '4',
} as const);

/** `MDReportEvent` values (`FIX::MDReportEvent_*`). */
export const MDReportEvent = /* @__PURE__ */ Object.freeze({
  StartInstrumentRefData: '1',
  EndInstrumentRefData: '2',
  StartOffMarketTrades: '3',
  EndOffMarketTrades: '4',
  StartOrderBookTrades: '5',
  EndOrderBookTrades: '6',
  StartOpenInterest: '7',
  EndOpenInterest: '8',
  StartSettlementPrices: '9',
  EndSettlementPrices: '10',
  StartStatsRefData: '11',
  EndStatsRefData: '12',
  StartStatistics: '13',
  EndStatistics: '14',
} as const);

/** `MDReqRejReason` values (`FIX::MDReqRejReason_*`). */
export const MDReqRejReason = /* @__PURE__ */ Object.freeze({
  UnknownSymbol: '0',
  DuplicateMdReqId: '1',
  InsufficientBandwidth: '2',
  InsufficientPermissions: '3',
  UnsupportedSubscriptionRequestType: '4',
  UnsupportedMarketDepth: '5',
  UnsupportedMdUpdateType: '6',
  UnsupportedAggregatedBook: '7',
  UnsupportedMdEntryType: '8',
  UnsupportedMdImplicitDelete: 'C',
  UnsupportedOpenCloseSettleFlag: 'B',
  UnsupportedScope: 'A',
  UnsupportedTradingSessionId: '9',
  InsufficientCredit: 'D',
} as const);

/** `MDSecSizeType` values (`FIX::MDSecSizeType_*`). */
export const MDSecSizeType = /* @__PURE__ */ Object.freeze({
  Customer: '1',
  CustomerProfessional: '2',
  DoNotTradeThrough: '3',
} as const);

/** `MDStatisticIntervalType` values (`FIX::MDStatisticIntervalType_*`). */
export const MDStatisticIntervalType = /* @__PURE__ */ Object.freeze({
  SlidingWindow: '1',
  SlidingWindowPeak: '2',
  FixedDateRange: '3',
  FixedTimeRange: '4',
  CurrentTimeUnit: '5',
  PreviousTimeUnit: '6',
  MaximumRange: '7',
  MaximumRangeUpToPreviousTimeUnit: '8',
} as const);

/** `MDStatisticRatioType` values (`FIX::MDStatisticRatioType_*`). */
export const MDStatisticRatioType = /* @__PURE__ */ Object.freeze({
  BuyersToSellers: '1',
  UpticksToDownticks: '2',
  MarketMakerToNonMarketMaker: '3',
  AutomatedToNonAutomated: '4',
  OrdersToTrades: '5',
  QuotesToTrades: '6',
  OrdersAndQuotesToTrades: '7',
  FailedToTotalTradedValue: '8',
  BenefitsToTotalTradedValue: '9',
  FeesToTotalTradedValue: '10',
  TradeVolumeToTotalTradedVolume: '11',
  OrdersToTotalNumberOrders: '12',
} as const);

/** `MDStatisticRequestResult` values (`FIX::MDStatisticRequestResult_*`). */
export const MDStatisticRequestResult = /* @__PURE__ */ Object.freeze({
  Successful: '0',
  InvalidOrUnknownMarket: '1',
  InvalidOrUnknownMarketSegment: '2',
  InvalidOrUnknownSecurityList: '3',
  InvalidOrUnknownInstruments: '4',
  InvalidParties: '5',
  TradeDateOutOfSupportedRange: '6',
  UnsupportedStatisticType: '7',
  UnsupportedScopeOrSubScope: '8',
  UnsupportedScopeType: '9',
  MarketDepthNotSupported: '10',
  FrequencyNotSupported: '11',
  UnsupportedStatisticInterval: '12',
  UnsupportedStatisticDateRange: '13',
  UnsupportedStatisticTimeRange: '14',
  UnsupportedRatioType: '15',
  InvalidOrUnknownTradeInputSource: '16',
  InvalidOrUnknownTradingSession: '17',
  UnauthorizedForStatisticRequest: '18',
  Other: '99',
} as const);

/** `MDStatisticScope` values (`FIX::MDStatisticScope_*`). */
export const MDStatisticScope = /* @__PURE__ */ Object.freeze({
  BidPrices: '1',
  OfferPrices: '2',
  BidDepth: '3',
  OfferDepth: '4',
  Orders: '5',
  Quotes: '6',
  OrdersAndQuotes: '7',
  Trades: '8',
  TradePrices: '9',
  AuctionPrices: '10',
  OpeningPrices: '11',
  ClosingPrices: '12',
  SettlementPrices: '13',
  UnderlyingPrices: '14',
  OpenInterest: '15',
  IndexValues: '16',
  MarginRates: '17',
  Outages: '18',
  ScheduledAuctions: '19',
  ReferencePrices: '20',
  TradeValue: '21',
  MarketDataFeeItems: '22',
  Rebates: '23',
  Discounts: '24',
  Payments: '25',
  Taxes: '26',
  Levies: '27',
  Benefits: '28',
  Fees: '29',
  OrdersRfQs: '30',
  MarketMakers: '31',
  TradingInterruptions: '32',
  TradingSuspensions: '33',
  NoQuotes: '34',
  RequestForQuotes: '35',
  TradeVolume: '36',
} as const);

/** `MDStatisticScopeType` values (`FIX::MDStatisticScopeType_*`). */
export const MDStatisticScopeType = /* @__PURE__ */ Object.freeze({
  EntryRate: '1',
  ModificationRate: '2',
  CancelRate: '3',
  DownwardMove: '4',
  UpwardMove: '5',
} as const);

/** `MDStatisticStatus` values (`FIX::MDStatisticStatus_*`). */
export const MDStatisticStatus = /* @__PURE__ */ Object.freeze({
  Active: '1',
  Inactive: '2',
} as const);

/** `MDStatisticSubScope` values (`FIX::MDStatisticSubScope_*`). */
export const MDStatisticSubScope = /* @__PURE__ */ Object.freeze({
  Visible: '1',
  Hidden: '2',
  Indicative: '3',
  Tradeable: '4',
  Passive: '5',
  MarketConsensus: '6',
  Power: '7',
  HardwareError: '8',
  SoftwareError: '9',
  NetworkError: '10',
  Failed: '11',
  Executed: '12',
  Entered: '13',
  Modified: '14',
  Cancelled: '15',
  MarketDataAccess: '16',
  TerminalAccess: '17',
  Volume: '18',
  Cleared: '19',
  Settled: '20',
  Other: '21',
  Monetary: '22',
  NonMonetary: '23',
  Gross: '24',
  LargeInScale: '25',
  NeitherHiddenNorLargeInScale: '26',
  CorporateAction: '27',
  VenueDecision: '28',
  MinimumTimePeriod: '29',
  Open: '30',
  NotExecuted: '31',
  Aggressive: '32',
  Directed: '33',
} as const);

/** `MDStatisticType` values (`FIX::MDStatisticType_*`). */
export const MDStatisticType = /* @__PURE__ */ Object.freeze({
  Count: '1',
  AverageVolume: '2',
  TotalVolume: '3',
  Distribution: '4',
  Ratio: '5',
  Liquidity: '6',
  Vwap: '7',
  Volatility: '8',
  Duration: '9',
  Tick: '10',
  AverageValue: '11',
  TotalValue: '12',
  High: '13',
  Low: '14',
  Midpoint: '15',
  First: '16',
  Last: '17',
  Final: '18',
  ExchangeBest: '19',
  ExchangeBestWithVolume: '20',
  ConsolidatedBest: '21',
  ConsolidatedBestWithVolume: '22',
  Twap: '23',
  AverageDuration: '24',
  AveragePrice: '25',
  TotalFees: '26',
  TotalBenefits: '27',
  MedianValue: '28',
  AverageLiquidity: '29',
  MedianDuration: '30',
} as const);

/** `MDStatisticValueType` values (`FIX::MDStatisticValueType_*`). */
export const MDStatisticValueType = /* @__PURE__ */ Object.freeze({
  Absolute: '1',
  Percentage: '2',
} as const);

/** `MDUpdateAction` values (`FIX::MDUpdateAction_*`). */
export const MDUpdateAction = /* @__PURE__ */ Object.freeze({
  New: '0',
  Change: '1',
  Delete: '2',
  DeleteThru: '3',
  DeleteFrom: '4',
  Overlay: '5',
} as const);

/** `MDUpdateType` values (`FIX::MDUpdateType_*`). */
export const MDUpdateType = /* @__PURE__ */ Object.freeze({
  FullRefresh: '0',
  IncrementalRefresh: '1',
} as const);

/** `MDValueTier` values (`FIX::MDValueTier_*`). */
export const MDValueTier = /* @__PURE__ */ Object.freeze({
  Range1: '1',
  Range2: '2',
  Range3: '3',
} as const);

/** `MarginAmtType` values (`FIX::MarginAmtType_*`). */
export const MarginAmtType = /* @__PURE__ */ Object.freeze({
  AdditionalMargin: '1',
  AdjustedMargin: '2',
  UnadjustedMargin: '3',
  BinaryAddOnAmount: '4',
  CashBalanceAmount: '5',
  ConcentrationMargin: '6',
  CoreMargin: '7',
  DeliveryMargin: '8',
  DiscretionaryMargin: '9',
  FuturesSpreadMargin: '10',
  InitialMargin: '11',
  LiquidatingMargin: '12',
  MarginCallAmount: '13',
  MarginDeficitAmount: '14',
  MarginExcessAmount: '15',
  OptionPremiumAmount: '16',
  PremiumMargin: '17',
  ReserveMargin: '18',
  SecurityCollateralAmount: '19',
  StressTestAddOnAmount: '20',
  SuperMargin: '21',
  TotalMargin: '22',
  VariationMargin: '23',
  SecondaryVariationMargin: '24',
  RolledUpMarginDeficit: '25',
  SpreadResponseMargin: '26',
  SystemicRiskMargin: '27',
  CurveRiskMargin: '28',
  IndexSpreadRiskMargin: '29',
  SectorRiskMargin: '30',
  JumpToDefaultRiskMargin: '31',
  BasisRiskMargin: '32',
  InterestRateRiskMargin: '33',
  JumpToHealthRiskMargin: '34',
  OtherRiskMargin: '35',
} as const);

/** `MarginDirection` values (`FIX::MarginDirection_*`). */
export const MarginDirection = /* @__PURE__ */ Object.freeze({
  Posted: '0',
  Received: '1',
} as const);

/** `MarginReqmtInqQualifier` values (`FIX::MarginReqmtInqQualifier_*`). */
export const MarginReqmtInqQualifier = /* @__PURE__ */ Object.freeze({
  Summary: '0',
  Detail: '1',
  ExcessDeficit: '2',
  NetPosition: '3',
} as const);

/** `MarginReqmtInqResult` values (`FIX::MarginReqmtInqResult_*`). */
export const MarginReqmtInqResult = /* @__PURE__ */ Object.freeze({
  Successful: '0',
  InvalidOrUnknownInstrument: '1',
  InvalidOrUnknownMarginClass: '2',
  InvalidParties: '3',
  InvalidTransportTypeReq: '4',
  InvalidDestinationReq: '5',
  NoMarginReqFound: '6',
  MarginReqInquiryQualifierNotSupported: '7',
  UnauthorizedForMarginReqInquiry: '8',
  Other: '99',
} as const);

/** `MarginReqmtRptType` values (`FIX::MarginReqmtRptType_*`). */
export const MarginReqmtRptType = /* @__PURE__ */ Object.freeze({
  Summary: '0',
  Detail: '1',
  ExcessDeficit: '2',
} as const);

/** `MarketCondition` values (`FIX::MarketCondition_*`). */
export const MarketCondition = /* @__PURE__ */ Object.freeze({
  Normal: '0',
  Stressed: '1',
  Exceptional: '2',
} as const);

/** `MarketDisruptionFallbackProvision` values (`FIX::MarketDisruptionFallbackProvision_*`). */
export const MarketDisruptionFallbackProvision = /* @__PURE__ */ Object.freeze({
  MasterAgreement: '0',
  Confirmation: '1',
} as const);

/** `MarketDisruptionFallbackUnderlierType` values (`FIX::MarketDisruptionFallbackUnderlierType_*`). */
export const MarketDisruptionFallbackUnderlierType = /* @__PURE__ */ Object.freeze({
  Basket: '0',
  Bond: '1',
  Cash: '2',
  Commodity: '3',
  ConvertibleBond: '4',
  Equity: '5',
  ExchangeTradedFund: '6',
  Future: '7',
  Index: '8',
  Loan: '9',
  Mortgage: '10',
  MutualFund: '11',
} as const);

/** `MarketDisruptionProvision` values (`FIX::MarketDisruptionProvision_*`). */
export const MarketDisruptionProvision = /* @__PURE__ */ Object.freeze({
  NotApplicable: '0',
  Applicable: '1',
  AsInMasterAgreement: '2',
  AsInConfirmation: '3',
} as const);

/** `MarketMakerActivity` values (`FIX::MarketMakerActivity_*`). */
export const MarketMakerActivity = /* @__PURE__ */ Object.freeze({
  NoParticipation: '0',
  BuyParticipation: '1',
  SellParticipation: '2',
  BothBuyAndSellParticipation: '3',
} as const);

/** `MarketSegmentRelationship` values (`FIX::MarketSegmentRelationship_*`). */
export const MarketSegmentRelationship = /* @__PURE__ */ Object.freeze({
  MarketSegmentPoolMember: '1',
  RetailSegment: '2',
  WholesaleSegment: '3',
} as const);

/** `MarketSegmentStatus` values (`FIX::MarketSegmentStatus_*`). */
export const MarketSegmentStatus = /* @__PURE__ */ Object.freeze({
  Active: '1',
  Inactive: '2',
  Published: '3',
} as const);

/** `MarketSegmentSubType` values (`FIX::MarketSegmentSubType_*`). */
export const MarketSegmentSubType = /* @__PURE__ */ Object.freeze({
  InterProductSpread: '1',
} as const);

/** `MarketSegmentType` values (`FIX::MarketSegmentType_*`). */
export const MarketSegmentType = /* @__PURE__ */ Object.freeze({
  Pool: '1',
  Retail: '2',
  Wholesale: '3',
} as const);

/** `MarketUpdateAction` values (`FIX::MarketUpdateAction_*`). */
export const MarketUpdateAction = /* @__PURE__ */ Object.freeze({
  Add: 'A',
  Delete: 'D',
  Modify: 'M',
} as const);

/** `MassActionReason` values (`FIX::MassActionReason_*`). */
export const MassActionReason = /* @__PURE__ */ Object.freeze({
  None: '0',
  TradingRiskControl: '1',
  ClearingRiskControl: '2',
  MarketMakerProtection: '3',
  StopTrading: '4',
  EmergencyAction: '5',
  SessionLossLogout: '6',
  DuplicateLogin: '7',
  ProductNotTraded: '8',
  InstrumentNotTraded: '9',
  CompleInstrumentDeleted: '10',
  CircuitBreakerActivated: '11',
  Other: '99',
} as const);

/** `MassActionRejectReason` values (`FIX::MassActionRejectReason_*`). */
export const MassActionRejectReason = /* @__PURE__ */ Object.freeze({
  MassActionNotSupported: '0',
  InvalidOrUnknownSecurity: '1',
  InvalidOrUnknownUnderlyingSecurity: '2',
  InvalidOrUnknownProduct: '3',
  InvalidOrUnknownCfiCode: '4',
  InvalidOrUnknownSecurityType: '5',
  InvalidOrUnknownTradingSession: '6',
  InvalidOrUnknownMarket: '7',
  InvalidOrUnknownMarketSegment: '8',
  InvalidOrUnknownSecurityGroup: '9',
  Other: '99',
  InvalidOrUnknownSecurityIssuer: '10',
  InvalidOrUnknownIssuerOfUnderlyingSecurity: '11',
} as const);

/** `MassActionResponse` values (`FIX::MassActionResponse_*`). */
export const MassActionResponse = /* @__PURE__ */ Object.freeze({
  Rejected: '0',
  Accepted: '1',
  Completed: '2',
} as const);

/** `MassActionScope` values (`FIX::MassActionScope_*`). */
export const MassActionScope = /* @__PURE__ */ Object.freeze({
  AllOrdersForASecurity: '1',
  AllOrdersForAnUnderlyingSecurity: '2',
  AllOrdersForAProduct: '3',
  AllOrdersForAcfiCode: '4',
  AllOrdersForASecurityType: '5',
  AllOrdersForATradingSession: '6',
  AllOrders: '7',
  AllOrdersForAMarket: '8',
  AllOrdersForAMarketSegment: '9',
  AllOrdersForASecurityGroup: '10',
  CancelForSecurityIssuer: '11',
  CancelForIssuerOfUnderlyingSecurity: '12',
} as const);

/** `MassActionType` values (`FIX::MassActionType_*`). */
export const MassActionType = /* @__PURE__ */ Object.freeze({
  SuspendOrders: '1',
  ReleaseOrdersFromSuspension: '2',
  CancelOrders: '3',
} as const);

/** `MassCancelRejectReason` values (`FIX::MassCancelRejectReason_*`). */
export const MassCancelRejectReason = /* @__PURE__ */ Object.freeze({
  InvalidOrUnkownUnderlyingSecurity: '2',
  InvalidOrUnknownTradingSession: '6',
  InvalidOrUnknownSecurityType: '5',
  InvalidOrUnknownProduct: '3',
  InvalidOrUnknownSecurity: '1',
  MassCancelNotSupported: '0',
  InvalidOrUnknownCfiCode: '4',
  Other: '99',
  InvalidOrUnknownMarket: '7',
  InvalidOrUnkownMarketSegment: '8',
  InvalidOrUnknownSecurityGroup: '9',
  InvalidOrUnknownUnderlyingSecurity: '2',
  InvalidOrUnknownSecurityIssuer: '10',
  InvalidOrUnknownIssuerOfUnderlyingSecurity: '11',
} as const);

/** `MassCancelRequestType` values (`FIX::MassCancelRequestType_*`). */
export const MassCancelRequestType = /* @__PURE__ */ Object.freeze({
  CancelOrdersForASecurity: '1',
  CancelAllOrders: '7',
  CancelOrdersForATradingSession: '6',
  CancelOrdersForASecurityType: '5',
  CancelOrdersForAcfiCode: '4',
  CancelOrdersForAnUnderlyingSecurity: '2',
  CancelOrdersForAProduct: '3',
  CancelOrdersForAMarket: '8',
  CancelOrdersForAMarketSegment: '9',
  CancelOrdersForASecurityGroup: 'A',
  CancelOrdersForSecurityIssuer: 'B',
  CancelForIssuerOfUnderlyingSecurity: 'C',
} as const);

/** `MassCancelResponse` values (`FIX::MassCancelResponse_*`). */
export const MassCancelResponse = /* @__PURE__ */ Object.freeze({
  CancelOrdersForATradingSession: '6',
  CancelRequestRejected: '0',
  CancelAllOrders: '7',
  CancelOrdersForAProduct: '3',
  CancelOrdersForASecurityType: '5',
  CancelOrdersForAcfiCode: '4',
  CancelOrdersForASecurity: '1',
  CancelOrdersForAnUnderlyingSecurity: '2',
  CancelOrdersForAMarket: '8',
  CancelOrdersForAMarketSegment: '9',
  CancelOrdersForASecurityGroup: 'A',
  CancelOrdersForASecuritiesIssuer: 'B',
  CancelOrdersForIssuerOfUnderlyingSecurity: 'C',
} as const);

/** `MassOrderRequestResult` values (`FIX::MassOrderRequestResult_*`). */
export const MassOrderRequestResult = /* @__PURE__ */ Object.freeze({
  Successful: '0',
  ResponseLevelNotSupported: '1',
  InvalidMarket: '2',
  InvalidMarketSegment: '3',
  Other: '99',
} as const);

/** `MassOrderRequestStatus` values (`FIX::MassOrderRequestStatus_*`). */
export const MassOrderRequestStatus = /* @__PURE__ */ Object.freeze({
  Accepted: '1',
  AcceptedWithAdditionalEvents: '2',
  Rejected: '3',
} as const);

/** `MassStatusReqType` values (`FIX::MassStatusReqType_*`). */
export const MassStatusReqType = /* @__PURE__ */ Object.freeze({
  StatusForOrdersForASecurity: '1',
  StatusForOrdersForAnUnderlyingSecurity: '2',
  StatusForOrdersForAProduct: '3',
  StatusForOrdersForAcfiCode: '4',
  StatusForOrdersForASecurityType: '5',
  StatusForOrdersForATradingSession: '6',
  StatusForOrdersForAPartyId: '8',
  StatusForAllOrders: '7',
  StatusForSecurityIssuer: '9',
  StatusForIssuerOfUnderlyingSecurity: '10',
} as const);

/** `MatchExceptionElementType` values (`FIX::MatchExceptionElementType_*`). */
export const MatchExceptionElementType = /* @__PURE__ */ Object.freeze({
  AccruedInterest: '1',
  DealPrice: '2',
  TradeDate: '3',
  SettlementDate: '4',
  SideIndicator: '5',
  TradedCurrency: '6',
  AccountId: '7',
  ExecutingBrokerId: '8',
  SettlementCurrencyAndAmount: '9',
  InvestmentManagerId: '10',
  NetAmount: '11',
  PlaceOfSettlement: '12',
  Commissions: '13',
  SecurityIdentifier: '14',
  QualityAllocated: '15',
  Principal: '16',
  Fees: '17',
  Tax: '18',
} as const);

/** `MatchExceptionToleranceValueType` values (`FIX::MatchExceptionToleranceValueType_*`). */
export const MatchExceptionToleranceValueType = /* @__PURE__ */ Object.freeze({
  FixedAmount: '1',
  Percentage: '2',
} as const);

/** `MatchExceptionType` values (`FIX::MatchExceptionType_*`). */
export const MatchExceptionType = /* @__PURE__ */ Object.freeze({
  NoMatchingConfirmation: '0',
  NoMatchingAllocation: '1',
  AllocationDataElementMissing: '2',
  ConfirmationDataElementMissing: '3',
  DataDifferenceNotWithinTolerance: '4',
  MatchWithinTolerance: '5',
  Other: '99',
} as const);

/** `MatchInst` values (`FIX::MatchInst_*`). */
export const MatchInst = /* @__PURE__ */ Object.freeze({
  Match: '1',
  DoNotMatch: '2',
} as const);

/** `MatchStatus` values (`FIX::MatchStatus_*`). */
export const MatchStatus = /* @__PURE__ */ Object.freeze({
  Compared: '0',
  Uncompared: '1',
  AdvisoryOrAlert: '2',
  Mismatched: '3',
} as const);

/** `MatchType` values (`FIX::MatchType_*`). */
export const MatchType = /* @__PURE__ */ Object.freeze({
  A5ExactMatchSummarizedQuantity: 'S5',
  ExactMatchMinusBadgesTimes: 'M1',
  Actm6Match: 'M6',
  ActDefaultAfterM2: 'M5',
  ActAcceptedTrade: 'M3',
  A2ExactMatchSummarizedQuantity: 'S2',
  A3ExactMatchSummarizedQuantity: 'S3',
  A4ExactMatchSummarizedQuantity: 'S4',
  SummarizedMatchMinusBadgesTimes: 'M2',
  ExactMatchPlus4Badges: 'A2',
  ExactMatchPlus2BadgesExecTime: 'A3',
  ExactMatchPlus2Badges: 'A4',
  StampedAdvisoriesOrSpecialistAccepts: 'AQ',
  OcsLockedIn: 'MT',
  ActDefaultTrade: 'M4',
  ExactMatchPlus4BadgesExecTime: 'A1',
  A1ExactMatchSummarizedQuantity: 'S1',
  ExactMatchPlusExecTime: 'A5',
  Fix50onlyOnePartyPrivatelyNegotiatedTradeReport: '60',
  Fix50onlyTwoPartyPrivatelyNegotiatedTradeReport: '61',
  Fix50onlyContinuousAutoMatch: '62',
  Fix50onlyCrossAuction: '63',
  Fix50onlyCounterOrderSelection: '64',
  Fix50onlyCallAuction: '65',
  CrossAuction: '5',
  CounterOrderSelection: '6',
  CallAuction: '7',
  OnePartyTradeReport: '1',
  TwoPartyTradeReport: '2',
  ConfirmedTradeReport: '3',
  AutoMatch: '4',
  Issuing: '8',
  SystematicInternaliser: '9',
  AutoMatchLastLook: '10',
  CrossAuctionLastLook: '11',
} as const);

/** `MatchingDataPointIndicator` values (`FIX::MatchingDataPointIndicator_*`). */
export const MatchingDataPointIndicator = /* @__PURE__ */ Object.freeze({
  Mandatory: '1',
  Optional: '2',
} as const);

/** `MaturityMonthYearFormat` values (`FIX::MaturityMonthYearFormat_*`). */
export const MaturityMonthYearFormat = /* @__PURE__ */ Object.freeze({
  YearMonthOnly: '0',
  YearMonthDay: '1',
  YearMonthWeek: '2',
} as const);

/** `MaturityMonthYearIncrementUnits` values (`FIX::MaturityMonthYearIncrementUnits_*`). */
export const MaturityMonthYearIncrementUnits = /* @__PURE__ */ Object.freeze({
  Months: '0',
  Days: '1',
  Weeks: '2',
  Years: '3',
} as const);

/** `MessageEncoding` values (`FIX::MessageEncoding_*`). */
export const MessageEncoding = /* @__PURE__ */ Object.freeze({
  Eucjp: 'EUC-JP',
  Iso2022Jp: 'ISO-2022-JP',
  ShiftJis: 'Shift_JIS',
  Utf8: 'UTF-8',
} as const);

/** `MinQtyMethod` values (`FIX::MinQtyMethod_*`). */
export const MinQtyMethod = /* @__PURE__ */ Object.freeze({
  Once: '1',
  Multiple: '2',
} as const);

/** `MiscFeeBasis` values (`FIX::MiscFeeBasis_*`). */
export const MiscFeeBasis = /* @__PURE__ */ Object.freeze({
  Absolute: '0',
  PerUnit: '1',
  Percentage: '2',
} as const);

/** `MiscFeeQualifier` values (`FIX::MiscFeeQualifier_*`). */
export const MiscFeeQualifier = /* @__PURE__ */ Object.freeze({
  Contributes: '0',
  DoesNotContribute: '1',
} as const);

/** `MiscFeeType` values (`FIX::MiscFeeType_*`). */
export const MiscFeeType = /* @__PURE__ */ Object.freeze({
  Regulatory: '1',
  Tax: '2',
  LocalCommission: '3',
  ExchangeFees: '4',
  Stamp: '5',
  Levy: '6',
  Other: '7',
  Markup: '8',
  ConsumptionTax: '9',
  PerTransaction: '10',
  Conversion: '11',
  Agent: '12',
  TransferFee: '13',
  SecurityLending: '14',
  TradeReporting: '15',
  TaxOnPrincipalAmount: '16',
  TaxOnAccruedInterestAmount: '17',
  NewIssuanceFee: '18',
  ServiceFee: '19',
  OddLotFee: '20',
  AuctionFee: '21',
  ValueAddedTax: '22',
  SalesTax: '23',
  ExecutionFee: '24',
  OrderEntryFee: '25',
  OrderModificationFee: '26',
  OrdersCancellationFee: '27',
  MarketDataAccessFee: '28',
  MarketDataTerminalFee: '29',
  MarketDataVolumeFee: '30',
  ClearingFee: '31',
  SettlementFee: '32',
  Rebates: '33',
  Discounts: '34',
  Payments: '35',
  NonMonetaryPayments: '36',
} as const);

/** `ModelType` values (`FIX::ModelType_*`). */
export const ModelType = /* @__PURE__ */ Object.freeze({
  UtilityProvidedStandardModel: '0',
  ProprietaryModel: '1',
} as const);

/** `MoneyLaunderingStatus` values (`FIX::MoneyLaunderingStatus_*`). */
export const MoneyLaunderingStatus = /* @__PURE__ */ Object.freeze({
  ExemptAuthorised: '3',
  ExemptMoneyType: '2',
  ExemptBelowLimit: '1',
  Passed: 'Y',
  NotChecked: 'N',
} as const);

/** `MsgDirection` values (`FIX::MsgDirection_*`). */
export const MsgDirection = /* @__PURE__ */ Object.freeze({
  Receive: 'R',
  Send: 'S',
} as const);

/** `MsgType` values (`FIX::MsgType_*`). */
export const MsgType = /* @__PURE__ */ Object.freeze({
  Heartbeat: '0',
  TestRequest: '1',
  ResendRequest: '2',
  Reject: '3',
  SequenceReset: '4',
  Logout: '5',
  Logon: 'A',
  XMLnonFIX: 'n',
  IOI: '6',
  Advertisement: '7',
  ExecutionReport: '8',
  OrderCancelReject: '9',
  News: 'B',
  Email: 'C',
  NewOrderSingle: 'D',
  NewOrderList: 'E',
  OrderCancelRequest: 'F',
  OrderCancelReplaceRequest: 'G',
  OrderStatusRequest: 'H',
  Allocation: 'J',
  ListCancelRequest: 'K',
  ListExecute: 'L',
  ListStatusRequest: 'M',
  ListStatus: 'N',
  AllocationInstructionAck: 'P',
  DontKnowTrade: 'Q',
  QuoteRequest: 'R',
  Quote: 'S',
  SettlementInstructions: 'T',
  MarketDataRequest: 'V',
  MarketDataSnapshotFullRefresh: 'W',
  MarketDataIncrementalRefresh: 'X',
  MarketDataRequestReject: 'Y',
  QuoteCancel: 'Z',
  QuoteStatusRequest: 'a',
  QuoteAcknowledgement: 'b',
  SecurityDefinitionRequest: 'c',
  SecurityDefinition: 'd',
  SecurityStatusRequest: 'e',
  SecurityStatus: 'f',
  TradingSessionStatusRequest: 'g',
  TradingSessionStatus: 'h',
  MassQuote: 'i',
  BusinessMessageReject: 'j',
  BidRequest: 'k',
  BidResponse: 'l',
  ListStrikePrice: 'm',
  AllocationAck: 'P',
  MassQuoteAcknowledgement: 'b',
  RegistrationInstructions: 'o',
  RegistrationInstructionsResponse: 'p',
  OrderMassCancelRequest: 'q',
  OrderMassCancelReport: 'r',
  NewOrderCross: 's',
  CrossOrderCancelReplaceRequest: 't',
  CrossOrderCancelRequest: 'u',
  SecurityTypeRequest: 'v',
  SecurityTypes: 'w',
  SecurityListRequest: 'x',
  SecurityList: 'y',
  DerivativeSecurityListRequest: 'z',
  DerivativeSecurityList: 'AA',
  NewOrderMultileg: 'AB',
  MultilegOrderCancelReplaceRequest: 'AC',
  TradeCaptureReportRequest: 'AD',
  TradeCaptureReport: 'AE',
  OrderMassStatusRequest: 'AF',
  QuoteRequestReject: 'AG',
  RFQRequest: 'AH',
  QuoteStatusReport: 'AI',
  AllocationInstruction: 'J',
  MultilegOrderCancelReplace: 'AC',
  QuoteResponse: 'AJ',
  Confirmation: 'AK',
  PositionMaintenanceRequest: 'AL',
  PositionMaintenanceReport: 'AM',
  RequestForPositions: 'AN',
  RequestForPositionsAck: 'AO',
  PositionReport: 'AP',
  TradeCaptureReportRequestAck: 'AQ',
  TradeCaptureReportAck: 'AR',
  AllocationReport: 'AS',
  AllocationReportAck: 'AT',
  ConfirmationAck: 'AU',
  SettlementInstructionRequest: 'AV',
  AssignmentReport: 'AW',
  CollateralRequest: 'AX',
  CollateralAssignment: 'AY',
  CollateralResponse: 'AZ',
  CollateralReport: 'BA',
  CollateralInquiry: 'BB',
  NetworkCounterpartySystemStatusRequest: 'BC',
  NetworkCounterpartySystemStatusResponse: 'BD',
  UserRequest: 'BE',
  UserResponse: 'BF',
  CollateralInquiryAck: 'BG',
  ConfirmationRequest: 'BH',
  ContraryIntentionReport: 'BO',
  SecurityDefinitionUpdateReport: 'BP',
  SecurityListUpdateReport: 'BK',
  AdjustedPositionReport: 'BL',
  AllocationInstructionAlert: 'BM',
  ExecutionAcknowledgement: 'BN',
  TradingSessionList: 'BJ',
  TradingSessionListRequest: 'BI',
  SettlementObligationReport: 'BQ',
  DerivativeSecurityListUpdateReport: 'BR',
  TradingSessionListUpdateReport: 'BS',
  MarketDefinitionRequest: 'BT',
  MarketDefinition: 'BU',
  MarketDefinitionUpdateReport: 'BV',
  UserNotification: 'CB',
  OrderMassActionReport: 'BZ',
  OrderMassActionRequest: 'CA',
  ApplicationMessageRequest: 'BW',
  ApplicationMessageRequestAck: 'BX',
  ApplicationMessageReport: 'BY',
  MassQuoteAck: 'b',
  ExecutionAck: 'BN',
  StreamAssignmentRequest: 'CC',
  StreamAssignmentReport: 'CD',
  StreamAssignmentReportACK: 'CE',
  MarginRequirementInquiry: 'CH',
  MarginRequirementInquiryAck: 'CI',
  MarginRequirementReport: 'CJ',
  PartyDetailsListRequest: 'CF',
  PartyDetailsListReport: 'CG',
  PartyDetailsListUpdateReport: 'CK',
  PartyRiskLimitsRequest: 'CL',
  PartyRiskLimitsReport: 'CM',
  SecurityMassStatusRequest: 'CN',
  SecurityMassStatus: 'CO',
  AccountSummaryReport: 'CQ',
  PartyRiskLimitsUpdateReport: 'CR',
  PartyRiskLimitsDefinitionRequest: 'CS',
  PartyRiskLimitsDefinitionRequestAck: 'CT',
  PartyEntitlementsRequest: 'CU',
  PartyEntitlementsReport: 'CV',
  QuoteAck: 'CW',
  PartyDetailsDefinitionRequest: 'CX',
  PartyDetailsDefinitionRequestAck: 'CY',
  PartyEntitlementsUpdateReport: 'CZ',
  PartyEntitlementsDefinitionRequest: 'DA',
  PartyEntitlementsDefinitionRequestAck: 'DB',
  TradeMatchReport: 'DC',
  TradeMatchReportAck: 'DD',
  PartyRiskLimitsReportAck: 'DE',
  PartyRiskLimitCheckRequest: 'DF',
  PartyRiskLimitCheckRequestAck: 'DG',
  PartyActionRequest: 'DH',
  PartyActionReport: 'DI',
  MassOrder: 'DJ',
  MassOrderAck: 'DK',
  PositionTransferInstruction: 'DL',
  PositionTransferInstructionAck: 'DM',
  PositionTransferReport: 'DN',
  MarketDataStatisticsRequest: 'DO',
  MarketDataStatisticsReport: 'DP',
  CollateralReportAck: 'DQ',
  MarketDataReport: 'DR',
  CrossRequest: 'DS',
  CrossRequestAck: 'DT',
  AllocationInstructionAlertRequest: 'DU',
  AllocationInstructionAlertRequestAck: 'DV',
  TradeAggregationRequest: 'DW',
  TradeAggregationReport: 'DX',
  PayManagementReport: 'EA',
  PayManagementReportAck: 'EB',
  PayManagementRequest: 'DY',
  PayManagementRequestAck: 'DZ',
} as const);

/** `MultiJurisdictionReportingIndicator` values (`FIX::MultiJurisdictionReportingIndicator_*`). */
export const MultiJurisdictionReportingIndicator = /* @__PURE__ */ Object.freeze({
  NotMultiJrsdctnEligible: '0',
  MultiJrsdctnEligible: '1',
} as const);

/** `MultiLegReportingType` values (`FIX::MultiLegReportingType_*`). */
export const MultiLegReportingType = /* @__PURE__ */ Object.freeze({
  SingleSecurity: '1',
  IndividualLegOfAMultiLegSecurity: '2',
  MultiLegSecurity: '3',
} as const);

/** `MultiLegRptTypeReq` values (`FIX::MultiLegRptTypeReq_*`). */
export const MultiLegRptTypeReq = /* @__PURE__ */ Object.freeze({
  ReportByMulitlegSecurityOnly: '0',
  ReportByMultilegSecurityAndInstrumentLegs: '1',
  ReportByInstrumentLegsOnly: '2',
} as const);

/** `MultilegModel` values (`FIX::MultilegModel_*`). */
export const MultilegModel = /* @__PURE__ */ Object.freeze({
  PredefinedMultilegSecurity: '0',
  UserDefinedMultilegSecurity: '1',
  UserDefined: '2',
} as const);

/** `MultilegPriceMethod` values (`FIX::MultilegPriceMethod_*`). */
export const MultilegPriceMethod = /* @__PURE__ */ Object.freeze({
  NetPrice: '0',
  ReversedNetPrice: '1',
  YieldDifference: '2',
  Individual: '3',
  ContractWeightedAveragePrice: '4',
  MultipliedPrice: '5',
} as const);

/** `NBBOEntryType` values (`FIX::NBBOEntryType_*`). */
export const NBBOEntryType = /* @__PURE__ */ Object.freeze({
  Bid: '0',
  Offer: '1',
  MidPrice: '2',
} as const);

/** `NBBOSource` values (`FIX::NBBOSource_*`). */
export const NBBOSource = /* @__PURE__ */ Object.freeze({
  NotApplicable: '0',
  Direct: '1',
  Sip: '2',
  Hybrid: '3',
} as const);

/** `NegotiationMethod` values (`FIX::NegotiationMethod_*`). */
export const NegotiationMethod = /* @__PURE__ */ Object.freeze({
  AutoSpot: '0',
  NegotiatedSpot: '1',
  PhoneSpot: '2',
} as const);

/** `NetGrossInd` values (`FIX::NetGrossInd_*`). */
export const NetGrossInd = /* @__PURE__ */ Object.freeze({
  Net: '1',
  Gross: '2',
} as const);

/** `NetworkRequestType` values (`FIX::NetworkRequestType_*`). */
export const NetworkRequestType = /* @__PURE__ */ Object.freeze({
  Snapshot: '1',
  Subscribe: '2',
  StopSubscribing: '4',
  LevelOfDetail: '8',
} as const);

/** `NetworkStatusResponseType` values (`FIX::NetworkStatusResponseType_*`). */
export const NetworkStatusResponseType = /* @__PURE__ */ Object.freeze({
  Full: '1',
  IncrementalUpdate: '2',
} as const);

/** `NewsCategory` values (`FIX::NewsCategory_*`). */
export const NewsCategory = /* @__PURE__ */ Object.freeze({
  CompanyNews: '0',
  MarketplaceNews: '1',
  FinancialMarketNews: '2',
  TechnicalNews: '3',
  OtherNews: '99',
} as const);

/** `NewsRefType` values (`FIX::NewsRefType_*`). */
export const NewsRefType = /* @__PURE__ */ Object.freeze({
  Replacement: '0',
  OtherLanguage: '1',
  Complimentary: '2',
  Withdrawal: '3',
} as const);

/** `NoSides` values (`FIX::NoSides_*`). */
export const NoSides = /* @__PURE__ */ Object.freeze({
  OneSide: '1',
  BothSides: '2',
} as const);

/** `NonCashDividendTreatment` values (`FIX::NonCashDividendTreatment_*`). */
export const NonCashDividendTreatment = /* @__PURE__ */ Object.freeze({
  PotentialAdjustment: '0',
  CashEquivalent: '1',
} as const);

/** `NonDeliverableFixingDateType` values (`FIX::NonDeliverableFixingDateType_*`). */
export const NonDeliverableFixingDateType = /* @__PURE__ */ Object.freeze({
  Unadjusted: '0',
  Adjusted: '1',
} as const);

/** `NotAffectedReason` values (`FIX::NotAffectedReason_*`). */
export const NotAffectedReason = /* @__PURE__ */ Object.freeze({
  OrderSuspended: '0',
  InstrumentSuspended: '1',
} as const);

/** `NotifyBrokerOfCredit` values (`FIX::NotifyBrokerOfCredit_*`). */
export const NotifyBrokerOfCredit = /* @__PURE__ */ Object.freeze({
  No: 'N',
  Yes: 'Y',
} as const);

/** `ObligationType` values (`FIX::ObligationType_*`). */
export const ObligationType = /* @__PURE__ */ Object.freeze({
  Bond: '0',
  ConvertBond: '1',
  Mortgage: '2',
  Loan: '3',
} as const);

/** `OddLot` values (`FIX::OddLot_*`). */
export const OddLot = /* @__PURE__ */ Object.freeze({
  Yes: 'Y',
  No: 'N',
} as const);

/** `OffsetInstruction` values (`FIX::OffsetInstruction_*`). */
export const OffsetInstruction = /* @__PURE__ */ Object.freeze({
  Offset: '0',
  Onset: '1',
} as const);

/** `OffshoreIndicator` values (`FIX::OffshoreIndicator_*`). */
export const OffshoreIndicator = /* @__PURE__ */ Object.freeze({
  Regular: '0',
  Offshore: '1',
  Onshore: '2',
} as const);

/** `OpenClose` values (`FIX::OpenClose_*`). */
export const OpenClose = /* @__PURE__ */ Object.freeze({
  Close: 'C',
  Open: 'O',
} as const);

/** `OpenCloseSettlFlag` values (`FIX::OpenCloseSettlFlag_*`). */
export const OpenCloseSettlFlag = /* @__PURE__ */ Object.freeze({
  DailyOpen: '0',
  SessionOpen: '1',
  DeliverySettlementEntry: '2',
  ExpectedEntry: '3',
  EntryFromPreviousBusinessDay: '4',
  TheoreticalPriceValue: '5',
} as const);

/** `OpenCloseSettleFlag` values (`FIX::OpenCloseSettleFlag_*`). */
export const OpenCloseSettleFlag = /* @__PURE__ */ Object.freeze({
  DailyOpen: '0',
  SessionOpen: '1',
  DeliverySettlementEntry: '2',
  ExpectedEntry: '3',
  EntryFromPreviousBusinessDay: '4',
} as const);

/** `OptPayoutType` values (`FIX::OptPayoutType_*`). */
export const OptPayoutType = /* @__PURE__ */ Object.freeze({
  Vanilla: '1',
  Capped: '2',
  Binary: '3',
  Asian: '4',
  Barrier: '5',
  DigitalBarrier: '6',
  Lookback: '7',
  OtherPathDependent: '8',
  Other: '99',
} as const);

/** `OptionExerciseDateType` values (`FIX::OptionExerciseDateType_*`). */
export const OptionExerciseDateType = /* @__PURE__ */ Object.freeze({
  Unadjusted: '0',
  Adjusted: '1',
} as const);

/** `OrdRejReason` values (`FIX::OrdRejReason_*`). */
export const OrdRejReason = /* @__PURE__ */ Object.freeze({
  BrokerCredit: '0',
  UnknownSymbol: '1',
  ExchangeClosed: '2',
  OrderExceedsLimit: '3',
  TooLateToEnter: '4',
  UnknownOrder: '5',
  DuplicateOrder: '6',
  DuplicateOfAVerballyCommunicatedOrder: '7',
  StaleOrder: '8',
  TradeAlongRequired: '9',
  InvalidInvestorId: '10',
  UnsupportedOrderCharacteristic: '11',
  SurveillenceOption: '12',
  IncorrectQuantity: '13',
  IncorrectAllocatedQuantity: '14',
  UnknownAccount: '15',
  Other: '99',
  InvalidPriceIncrement: '18',
  PriceExceedsCurrentPriceBand: '16',
  SurveillanceOption: '12',
  ReferencePriceNotAvailable: '19',
  NotionalValueExceedsThreshold: '20',
  AlgorithmRiskThresholdBreached: '21',
  ShortSellNotPermitted: '22',
  ShortSellSecurityPreBorrowRestriction: '23',
  ShortSellAccountPreBorrowRestriction: '24',
  InsufficientCreditLimit: '25',
  ExceededClipSizeLimit: '26',
  ExceededMaxNotionalOrderAmt: '27',
  ExceededDv01Pv01Limit: '28',
  ExceededCs01Limit: '29',
} as const);

/** `OrdStatus` values (`FIX::OrdStatus_*`). */
export const OrdStatus = /* @__PURE__ */ Object.freeze({
  New: '0',
  PartiallyFilled: '1',
  Filled: '2',
  DoneForDay: '3',
  Canceled: '4',
  Replaced: '5',
  PendingCancel: '6',
  Stopped: '7',
  Rejected: '8',
  Suspended: '9',
  PendingNew: 'A',
  Calculated: 'B',
  Expired: 'C',
  AcceptedForBidding: 'D',
  PendingReplace: 'E',
} as const);

/** `OrdType` values (`FIX::OrdType_*`). */
export const OrdType = /* @__PURE__ */ Object.freeze({
  Market: '1',
  Limit: '2',
  Stop: '3',
  StopLimit: '4',
  MarketOnClose: '5',
  WithOrWithout: '6',
  LimitOrBetter: '7',
  LimitWithOrWithout: '8',
  OnBasis: '9',
  OnClose: 'A',
  LimitOnClose: 'B',
  ForexMarket: 'C',
  PreviouslyQuoted: 'D',
  PreviouslyIndicated: 'E',
  Pegged: 'P',
  ForexLimit: 'F',
  ForexSwap: 'G',
  ForexPreviouslyQuoted: 'H',
  Funari: 'I',
  MarketIfTouched: 'J',
  MarketWithLeftOverAsLimit: 'K',
  PreviousFundValuationPoint: 'L',
  NextFundValuationPoint: 'M',
  CounterOrderSelection: 'Q',
  StopOnBidOrOffer: 'R',
  StopLimitOnBidOrOffer: 'S',
} as const);

/** `OrderAttributeType` values (`FIX::OrderAttributeType_*`). */
export const OrderAttributeType = /* @__PURE__ */ Object.freeze({
  AggregatedOrder: '0',
  PendingAllocation: '1',
  LiquidityProvisionActivityOrder: '2',
  RiskReductionOrder: '3',
  AlgorithmicOrder: '4',
  SystematicInternaliserOrder: '5',
  AllExecutionsSubmittedToApa: '6',
  OrderExecutionInstructedByClient: '7',
  LargeInScale: '8',
  Hidden: '9',
  SubjectToEusto: '10',
  SubjectToUksto: '11',
  RepresentativeOrder: '12',
  LinkageType: '13',
  ExemptFromSto: '14',
} as const);

/** `OrderCapacity` values (`FIX::OrderCapacity_*`). */
export const OrderCapacity = /* @__PURE__ */ Object.freeze({
  RisklessPrincipal: 'R',
  Individual: 'I',
  Principal: 'P',
  AgentForOtherMember: 'W',
  Agency: 'A',
  Proprietary: 'G',
  MixedCapacity: 'M',
} as const);

/** `OrderCategory` values (`FIX::OrderCategory_*`). */
export const OrderCategory = /* @__PURE__ */ Object.freeze({
  Order: '1',
  Quote: '2',
  PrivatelyNegotiatedTrade: '3',
  MultilegOrder: '4',
  LinkedOrder: '5',
  QuoteRequest: '6',
  ImpliedOrder: '7',
  CrossOrder: '8',
  StreamingPrice: '9',
  InternalCrossOrder: 'A',
} as const);

/** `OrderDelayUnit` values (`FIX::OrderDelayUnit_*`). */
export const OrderDelayUnit = /* @__PURE__ */ Object.freeze({
  Seconds: '0',
  TenthsOfASecond: '1',
  HundredthsOfASecond: '2',
  Milliseconds: '3',
  Microseconds: '4',
  Nanoseconds: '5',
  Minutes: '10',
  Hours: '11',
  Days: '12',
  Weeks: '13',
  Months: '14',
  Years: '15',
} as const);

/** `OrderEntryAction` values (`FIX::OrderEntryAction_*`). */
export const OrderEntryAction = /* @__PURE__ */ Object.freeze({
  Add: '1',
  Modify: '2',
  Delete: '3',
  Suspend: '4',
  Release: '5',
} as const);

/** `OrderEventReason` values (`FIX::OrderEventReason_*`). */
export const OrderEventReason = /* @__PURE__ */ Object.freeze({
  AddOrderRequest: '1',
  ModifyOrderRequest: '2',
  DeleteOrderRequest: '3',
  OrderEnteredOob: '4',
  OrderModifiedOob: '5',
  OrderDeletedOob: '6',
  OrderActivatedOrTriggered: '7',
  OrderExpired: '8',
  ReserveOrderRefreshed: '9',
  AwayMarketBetter: '10',
  CorporateAction: '11',
  StartOfDay: '12',
  EndOfDay: '13',
} as const);

/** `OrderEventType` values (`FIX::OrderEventType_*`). */
export const OrderEventType = /* @__PURE__ */ Object.freeze({
  Added: '1',
  Modified: '2',
  Deleted: '3',
  PartiallyFilled: '4',
  Filled: '5',
  Suspended: '6',
  Released: '7',
  Restated: '8',
  Locked: '9',
  Triggered: '10',
  Activated: '11',
} as const);

/** `OrderHandlingInstSource` values (`FIX::OrderHandlingInstSource_*`). */
export const OrderHandlingInstSource = /* @__PURE__ */ Object.freeze({
  Nasdoats: '1',
  Finraoats: '1',
  FiaExecutionSourceCode: '2',
} as const);

/** `OrderOrigination` values (`FIX::OrderOrigination_*`). */
export const OrderOrigination = /* @__PURE__ */ Object.freeze({
  OrderReceivedFromCustomer: '1',
  OrderReceivedFromWithinFirm: '2',
  OrderReceivedFromAnotherBrokerDealer: '3',
  OrderReceivedFromCustomerOrWithFirm: '4',
  OrderReceivedFromDirectAccessCustomer: '5',
  OrderReceivedFromForeignDealerEquivalent: '6',
  OrderReceivedFromExecutionOnlyService: '7',
} as const);

/** `OrderOwnershipIndicator` values (`FIX::OrderOwnershipIndicator_*`). */
export const OrderOwnershipIndicator = /* @__PURE__ */ Object.freeze({
  NoChange: '0',
  ExecutingPartyChange: '1',
  EnteringPartyChange: '2',
  SpecifiedPartyChange: '3',
} as const);

/** `OrderRelationship` values (`FIX::OrderRelationship_*`). */
export const OrderRelationship = /* @__PURE__ */ Object.freeze({
  NotSpecified: '0',
  OrderAggregation: '1',
  OrderSplit: '2',
} as const);

/** `OrderResponseLevel` values (`FIX::OrderResponseLevel_*`). */
export const OrderResponseLevel = /* @__PURE__ */ Object.freeze({
  NoAck: '0',
  MinimumAck: '1',
  AckEach: '2',
  SummaryAck: '3',
} as const);

/** `OrderRestrictions` values (`FIX::OrderRestrictions_*`). */
export const OrderRestrictions = /* @__PURE__ */ Object.freeze({
  ForeignEntity: '7',
  RisklessArbitrage: 'A',
  ProgramTrade: '1',
  ExternalMarketParticipant: '8',
  ActingAsMarketMakerOrSpecialistInUnderlying: '6',
  ActingAsMarketMakerOrSpecialistInSecurity: '5',
  NonIndexArbitrage: '3',
  IndexArbitrage: '2',
  CompetingMarketMaker: '4',
  ExternalInterConnectedMarketLinkage: '9',
  IssuerHolding: 'B',
  IssuePriceStabilization: 'C',
  NonAlgorithmic: 'D',
  Algorithmic: 'E',
  Cross: 'F',
  InsiderAccount: 'G',
  SignificantShareholder: 'H',
  NormalCourseIssuerBid: 'I',
} as const);

/** `OrigCustOrderCapacity` values (`FIX::OrigCustOrderCapacity_*`). */
export const OrigCustOrderCapacity = /* @__PURE__ */ Object.freeze({
  MemberTradingForTheirOwnAccount: '1',
  ClearingFirmTradingForItsProprietaryAccount: '2',
  MemberTradingForAnotherMember: '3',
  AllOther: '4',
} as const);

/** `OwnerType` values (`FIX::OwnerType_*`). */
export const OwnerType = /* @__PURE__ */ Object.freeze({
  CompanyTrustee: '5',
  Nominee: '13',
  CorporateBody: '12',
  NonProfitOrganization: '11',
  NetworkingSubAccount: '10',
  Fiduciaries: '9',
  Trusts: '8',
  PensionPlan: '6',
  IndividualTrustee: '4',
  PublicCompany: '2',
  PrivateCompany: '3',
  IndividualInvestor: '1',
  CustodianUnderGiftsToMinorsAct: '7',
  InstitutionalCustomer: '14',
  Combined: '15',
  MemberFirmEmployee: '16',
  MarketMakingAccount: '17',
  ProprietaryAccount: '18',
  NonbrokerDealer: '19',
  UnknownBeneficialOwnerType: '20',
  FirmsErrorAccount: '21',
  FirmAgencyAveragePriceAccount: '22',
} as const);

/** `OwnershipType` values (`FIX::OwnershipType_*`). */
export const OwnershipType = /* @__PURE__ */ Object.freeze({
  JointInvestors: 'J',
  TenantsInCommon: 'T',
  JointTrustees: '2',
} as const);

/** `PartyActionRejectReason` values (`FIX::PartyActionRejectReason_*`). */
export const PartyActionRejectReason = /* @__PURE__ */ Object.freeze({
  InvalidParty: '0',
  UnkReqParty: '1',
  NotAuthorized: '98',
  Other: '99',
} as const);

/** `PartyActionResponse` values (`FIX::PartyActionResponse_*`). */
export const PartyActionResponse = /* @__PURE__ */ Object.freeze({
  Accepted: '0',
  Completed: '1',
  Rejected: '2',
} as const);

/** `PartyActionType` values (`FIX::PartyActionType_*`). */
export const PartyActionType = /* @__PURE__ */ Object.freeze({
  Suspend: '0',
  HaltTrading: '1',
  Reinstate: '2',
} as const);

/** `PartyDetailDefinitionStatus` values (`FIX::PartyDetailDefinitionStatus_*`). */
export const PartyDetailDefinitionStatus = /* @__PURE__ */ Object.freeze({
  Accepted: '0',
  AcceptedWithChanges: '1',
  Rejected: '2',
} as const);

/** `PartyDetailRequestResult` values (`FIX::PartyDetailRequestResult_*`). */
export const PartyDetailRequestResult = /* @__PURE__ */ Object.freeze({
  Successful: '0',
  InvalidParty: '1',
  InvalidRelatedParty: '2',
  InvalidPartyStatus: '3',
  NotAuthorized: '98',
  Other: '99',
} as const);

/** `PartyDetailRequestStatus` values (`FIX::PartyDetailRequestStatus_*`). */
export const PartyDetailRequestStatus = /* @__PURE__ */ Object.freeze({
  Accepted: '0',
  AcceptedWithChanges: '1',
  Rejected: '2',
  AcceptancePending: '3',
} as const);

/** `PartyDetailRoleQualifier` values (`FIX::PartyDetailRoleQualifier_*`). */
export const PartyDetailRoleQualifier = /* @__PURE__ */ Object.freeze({
  FirmOrLegalEntity: '23',
  Current: '18',
  New: '19',
  NaturalPerson: '24',
  Agency: '0',
  Principal: '1',
  RisklessPrincipal: '2',
  ExchangeOrderSubmitter: '30',
  PrimaryTrdRepository: '9',
  OrigTrdRepository: '10',
  AddtnlIntlTrdRepository: '11',
  AddtnlDomesticTrdRepository: '12',
  RegularTrader: '25',
  HeadTrader: '26',
  Supervisor: '27',
  Algorithm: '22',
  RelatedExchange: '13',
  OptionsExchange: '14',
  SpecifiedExchange: '15',
  ConstituentExchange: '16',
  Bank: '7',
  Hub: '8',
  TriParty: '28',
  Lender: '29',
  GeneralClearingMember: '3',
  IndividualClearingMember: '4',
  PreferredMarketMaker: '5',
  DirectedMarketMaker: '6',
  DesignatedSponsor: '20',
  Specialist: '21',
  ExemptFromTradeReporting: '17',
} as const);

/** `PartyDetailStatus` values (`FIX::PartyDetailStatus_*`). */
export const PartyDetailStatus = /* @__PURE__ */ Object.freeze({
  Active: '0',
  Suspended: '1',
  Halted: '2',
} as const);

/** `PartyIDSource` values (`FIX::PartyIDSource_*`). */
export const PartyIDSource = /* @__PURE__ */ Object.freeze({
  ChineseInvestorId: '5',
  UsEmployerOrTaxIdNumber: '8',
  AustralianTaxFileNumber: 'A',
  AustralianBusinessNumber: '9',
  IsoCountryCode: 'E',
  Bic: 'B',
  UsSocialSecurityNumber: '7',
  Proprietary: 'D',
  SettlementEntityLocation: 'F',
  KoreanInvestorId: '1',
  TaiwaneseForeignInvestorId: '2',
  TaiwaneseTradingAcct: '3',
  MalaysianCentralDepository: '4',
  UkNationalInsuranceOrPensionNumber: '6',
  GeneralIdentifier: 'C',
  Mic: 'G',
  CsdParticipant: 'H',
  IsitcAcronym: 'I',
  TaxId: 'J',
  AustralianCompanyNumber: 'K',
  AustralianRegisteredBodyNumber: 'L',
  CftcReportingFirmIdentifier: 'M',
  LegalEntityIdentifier: 'N',
  InterimIdentifier: 'O',
  ShortCodeIdentifier: 'P',
  NationalIdNaturalPerson: 'Q',
  IndiaPermanentAccountNumber: 'R',
  Fdid: 'S',
  Spsaid: 'T',
  MasterSpsaid: 'U',
} as const);

/** `PartyRelationship` values (`FIX::PartyRelationship_*`). */
export const PartyRelationship = /* @__PURE__ */ Object.freeze({
  IsAlso: '0',
  ClearsFor: '1',
  ClearsThrough: '2',
  TradesFor: '3',
  TradesThrough: '4',
  Sponsors: '5',
  SponsoredThrough: '6',
  ProvidesGuaranteeFor: '7',
  IsGuaranteedBy: '8',
  MemberOf: '9',
  HasMembers: '10',
  ProvidesMarketplaceFor: '11',
  ParticipantOfMarketplace: '12',
  CarriesPositionsFor: '13',
  PostsTradesTo: '14',
  EntersTradesFor: '15',
  EntersTradesThrough: '16',
  ProvidesQuotesTo: '17',
  RequestsQuotesFrom: '18',
  InvestsFor: '19',
  InvestsThrough: '20',
  BrokersTradesFor: '21',
  BrokersTradesThrough: '22',
  ProvidesTradingServicesFor: '23',
  UsesTradingServicesOf: '24',
  ApprovesOf: '25',
  ApprovedBy: '26',
  ParentFirmFor: '27',
  SubsidiaryOf: '28',
  RegulatoryOwnerOf: '29',
  OwnedByRegulatory: '30',
  Controls: '31',
  IsControlledBy: '32',
  LegalOwnerOf: '33',
  OwnedByLegal: '34',
  BeneficialOwnerOf: '35',
  OwnedByBeneficial: '36',
  SettlesFor: '37',
  SettlesThrough: '38',
} as const);

/** `PartyRiskLimitStatus` values (`FIX::PartyRiskLimitStatus_*`). */
export const PartyRiskLimitStatus = /* @__PURE__ */ Object.freeze({
  Disabled: '0',
  Enabled: '1',
} as const);

/** `PartyRole` values (`FIX::PartyRole_*`). */
export const PartyRole = /* @__PURE__ */ Object.freeze({
  CorrespondantClearingFirm: '15',
  ClientId: '3',
  UnderlyingContraFirm: '20',
  SponsoringFirm: '19',
  ContraClearingFirm: '18',
  ContraFirm: '17',
  ExecutingSystem: '16',
  EnteringFirm: '7',
  ExecutingFirm: '1',
  BrokerOfCredit: '2',
  InvestorId: '5',
  IntroducingFirm: '6',
  GiveupClearingFirm: '97',
  Locate: '8',
  FundManagerClientId: '9',
  SettlementLocation: '10',
  OrderOriginationTrader: '11',
  ExecutingTrader: '12',
  OrderOriginationFirm: '13',
  ClearingFirm: '4',
  ClearingOrganization: '21',
  Exchange: '22',
  CustomerAccount: '24',
  CorrespondentClearingOrganization: '25',
  CorrespondentBroker: '26',
  Buyer: '27',
  Custodian: '28',
  Intermediary: '29',
  Agent: '30',
  SubCustodian: '31',
  Beneficiary: '32',
  InterestedParty: '33',
  RegulatoryBody: '34',
  LiquidityProvider: '35',
  EnteringTrader: '36',
  ContraTrader: '37',
  PositionAccount: '38',
  ContraInvestorId: '39',
  TransferToFirm: '40',
  ContraPositionAccount: '41',
  ContraExchange: '42',
  InternalCarryAccount: '43',
  OrderEntryOperatorId: '44',
  SecondaryAccountNumber: '45',
  ForeignFirm: '46',
  ThirdPartyAllocationFirm: '47',
  ClaimingAccount: '48',
  AssetManager: '49',
  PledgorAccount: '50',
  PledgeeAccount: '51',
  LargeTraderReportableAccount: '52',
  TraderMnemonic: '53',
  SenderLocation: '54',
  SessionId: '55',
  AcceptableCounterparty: '56',
  UnacceptableCounterparty: '57',
  EnteringUnit: '58',
  ExecutingUnit: '59',
  IntroducingBroker: '60',
  QuoteOriginator: '61',
  ReportOriginator: '62',
  SystematicInternaliser: '63',
  MultilateralTradingFacility: '64',
  RegulatedMarket: '65',
  MarketMaker: '66',
  InvestmentFirm: '67',
  HostCompetentAuthority: '68',
  HomeCompetentAuthority: '69',
  CompetentAuthorityLiquidity: '70',
  CompetentAuthorityTransactionVenue: '71',
  ReportingIntermediary: '72',
  ExecutionVenue: '73',
  MarketDataEntryOriginator: '74',
  LocationId: '75',
  DeskId: '76',
  MarketDataMarket: '77',
  AllocationEntity: '78',
  PrimeBroker: '79',
  StepOutFirm: '80',
  BrokerClearingId: '81',
  GiveupClearingFirmDepr: '14',
  CentralRegistrationDepository: '82',
  ClearingAccount: '83',
  AcceptableSettlingCounterparty: '84',
  UnacceptableSettlingCounterparty: '85',
  ClsMemberBank: '86',
  InConcertGroup: '87',
  InConcertControllingEntity: '88',
  LargePositionsReportingAccount: '89',
  SettlementFirm: '90',
  SettlementAccount: '91',
  ReportingMarketCenter: '92',
  RelatedReportingMarketCenter: '93',
  AwayMarket: '94',
  GiveupTradingFirm: '95',
  TakeupTradingFirm: '96',
  TakeupClearingFirm: '98',
  OriginatingMarket: '99',
  MarginAccount: '100',
  CollateralAssetAccount: '101',
  DataRepository: '102',
  CalculationAgent: '103',
  ExerciseNoticeSender: '104',
  ExerciseNoticeReceiver: '105',
  RateReferenceBank: '106',
  Correspondent: '107',
  BeneficiaryBank: '109',
  Borrower: '110',
  PrimaryObligator: '111',
  Guarantor: '112',
  ExcludedReferenceEntity: '113',
  DeterminingParty: '114',
  HedgingParty: '115',
  ReportingEntity: '116',
  SalesPerson: '117',
  Operator: '118',
  Csd: '119',
  Icsd: '120',
  TradingSubAccount: '121',
  InvestmentDecisionMaker: '122',
  PublishingIntermediary: '123',
  CsdParticipant: '124',
  Issuer: '125',
  ContraCustomerAccount: '126',
  ContraInvestmentDecisionMaker: '127',
} as const);

/** `PartySubIDType` values (`FIX::PartySubIDType_*`). */
export const PartySubIDType = /* @__PURE__ */ Object.freeze({
  Firm: '1',
  Person: '2',
  System: '3',
  Application: '4',
  FullLegalNameOfFirm: '5',
  PostalAddress: '6',
  PhoneNumber: '7',
  EmailAddress: '8',
  ContactName: '9',
  SecuritiesAccountNumber: '10',
  RegistrationNumber: '11',
  RegisteredAddressForConfirmation: '12',
  RegulatoryStatus: '13',
  RegistrationName: '14',
  CashAccountNumber: '15',
  Bic: '16',
  CsdParticipantMemberCode: '17',
  RegisteredAddress: '18',
  FundAccountName: '19',
  TelexNumber: '20',
  FaxNumber: '21',
  SecuritiesAccountName: '22',
  CashAccountName: '23',
  Department: '24',
  LocationDesk: '25',
  PositionAccountType: '26',
  SecurityLocateId: '27',
  MarketMaker: '28',
  EligibleCounterparty: '29',
  ProfessionalClient: '30',
  Location: '31',
  ExecutionVenue: '32',
  CurrencyDeliveryIdentifier: '33',
  AddressCity: '34',
  AddressStateOrProvince: '35',
  AddressPostalCode: '36',
  AddressStreet: '37',
  AddressIsoCountryCode: '38',
  IsoCountryCode: '39',
  MarketSegment: '40',
  CustomerAccountType: '41',
  OmnibusAccount: '42',
  FundsSegregationType: '43',
  GuaranteeFund: '44',
  SwapDealer: '45',
  MajorParticipant: '46',
  FinancialEntity: '47',
  UsPerson: '48',
  ReportingEntityIndicator: '49',
  ElectedClearingRequirementException: '50',
  BusinessCenter: '51',
  ReferenceText: '52',
  ShortMarkingExemptAccount: '53',
  ParentFirmIdentifier: '54',
  ParentFirmName: '55',
  DealIdentifier: '56',
  SystemTradeId: '57',
  SystemTradeSubId: '58',
  FcmCode: '59',
  DlvryTrmlCode: '60',
  VolntyRptEntity: '61',
  RptObligJursdctn: '62',
  VolntyRptJursdctn: '63',
  CompanyActivities: '64',
  EeAreaDomiciled: '65',
  ContractLinked: '66',
  ContractAbove: '67',
  VolntyRptPty: '68',
  EndUser: '69',
  LocationOrJurisdiction: '70',
  DerivativesDealer: '71',
  Domicile: '72',
  ExemptFromRecognition: '73',
  Payer: '74',
  Receiver: '75',
  SystematicInternaliser: '76',
  PublishingEntityIndicator: '77',
  FirstName: '78',
  Surname: '79',
  DateOfBirth: '80',
  OrderTransmittingFirm: '81',
  OrderTransmittingFirmBuyer: '82',
  OrderTransmitterSeller: '83',
  LegalEntityIdentifier: '84',
  SubSectorClassification: '85',
  PartySide: '86',
  LegalRegistrationCountry: '87',
} as const);

/** `PayReportStatus` values (`FIX::PayReportStatus_*`). */
export const PayReportStatus = /* @__PURE__ */ Object.freeze({
  Received: '0',
  Accepted: '1',
  Rejected: '2',
  Disputed: '3',
} as const);

/** `PayReportTransType` values (`FIX::PayReportTransType_*`). */
export const PayReportTransType = /* @__PURE__ */ Object.freeze({
  New: '0',
  Replace: '1',
  Status: '2',
} as const);

/** `PayRequestStatus` values (`FIX::PayRequestStatus_*`). */
export const PayRequestStatus = /* @__PURE__ */ Object.freeze({
  Received: '0',
  Accepted: '1',
  Rejected: '2',
  Disputed: '3',
} as const);

/** `PayRequestTransType` values (`FIX::PayRequestTransType_*`). */
export const PayRequestTransType = /* @__PURE__ */ Object.freeze({
  New: '0',
  Cancel: '1',
} as const);

/** `PaymentDateOffsetDayType` values (`FIX::PaymentDateOffsetDayType_*`). */
export const PaymentDateOffsetDayType = /* @__PURE__ */ Object.freeze({
  Business: '0',
  Calendar: '1',
  Commodity: '2',
  Currency: '3',
  Exchange: '4',
  Scheduled: '5',
} as const);

/** `PaymentForwardStartType` values (`FIX::PaymentForwardStartType_*`). */
export const PaymentForwardStartType = /* @__PURE__ */ Object.freeze({
  Prepaid: '0',
  Postpaid: '1',
  Variable: '2',
  Fixed: '3',
} as const);

/** `PaymentMethod` values (`FIX::PaymentMethod_*`). */
export const PaymentMethod = /* @__PURE__ */ Object.freeze({
  Bpay: '14',
  AchCredit: '13',
  AchDebit: '12',
  CreditCard: '11',
  DirectCredit: '10',
  DirectDebit: '9',
  DebitCard: '8',
  FedWire: '7',
  HighValueClearingSystem: '15',
  Euroclear: '3',
  TelegraphicTransfer: '6',
  Clearstream: '4',
  Crest: '1',
  Nscc: '2',
  Cheque: '5',
  Chips: '16',
  Swift: '17',
  Chaps: '18',
  Sic: '19',
  EuroSic: '20',
  Other: '999',
} as const);

/** `PaymentPaySide` values (`FIX::PaymentPaySide_*`). */
export const PaymentPaySide = /* @__PURE__ */ Object.freeze({
  Buy: '1',
  Sell: '2',
} as const);

/** `PaymentScheduleStepRelativeTo` values (`FIX::PaymentScheduleStepRelativeTo_*`). */
export const PaymentScheduleStepRelativeTo = /* @__PURE__ */ Object.freeze({
  Initial: '0',
  Previous: '1',
} as const);

/** `PaymentScheduleType` values (`FIX::PaymentScheduleType_*`). */
export const PaymentScheduleType = /* @__PURE__ */ Object.freeze({
  Notional: '0',
  CashFlow: '1',
  FxLinkedNotional: '2',
  FixedRate: '3',
  FutureValueNotional: '4',
  KnownAmount: '5',
  FloatingRateMultiplier: '6',
  Spread: '7',
  CapRate: '8',
  FloorRate: '9',
  NonDeliverableSettlPaymentDates: '10',
  NonDeliverableSettlCalculationDates: '11',
  NonDeliverableFxFixingDates: '12',
  SettlPeriodNotnl: '13',
  SettlPeriodPx: '14',
  CalcPeriod: '15',
  DividendAccrualRateMultiplier: '16',
  DividendAccrualRateSpread: '17',
  DividendAccrualCapRate: '18',
  DividendAccrualFloorRate: '19',
  CompoundingRateMultiplier: '20',
  CompoundingRateSpread: '21',
  CompoundingCapRate: '22',
  CompoundingFloorRate: '23',
} as const);

/** `PaymentSettlStyle` values (`FIX::PaymentSettlStyle_*`). */
export const PaymentSettlStyle = /* @__PURE__ */ Object.freeze({
  Standard: '0',
  Net: '1',
  StandardfNet: '2',
} as const);

/** `PaymentStreamAveragingMethod` values (`FIX::PaymentStreamAveragingMethod_*`). */
export const PaymentStreamAveragingMethod = /* @__PURE__ */ Object.freeze({
  Unweighted: '0',
  Weighted: '1',
} as const);

/** `PaymentStreamCapRateBuySide` values (`FIX::PaymentStreamCapRateBuySide_*`). */
export const PaymentStreamCapRateBuySide = /* @__PURE__ */ Object.freeze({
  Buyer: '1',
  Seller: '2',
} as const);

/** `PaymentStreamCompoundingMethod` values (`FIX::PaymentStreamCompoundingMethod_*`). */
export const PaymentStreamCompoundingMethod = /* @__PURE__ */ Object.freeze({
  None: '0',
  Flat: '1',
  Straight: '2',
  SpreadExclusive: '3',
} as const);

/** `PaymentStreamDiscountType` values (`FIX::PaymentStreamDiscountType_*`). */
export const PaymentStreamDiscountType = /* @__PURE__ */ Object.freeze({
  Standard: '0',
  Fra: '1',
} as const);

/** `PaymentStreamFRADiscounting` values (`FIX::PaymentStreamFRADiscounting_*`). */
export const PaymentStreamFRADiscounting = /* @__PURE__ */ Object.freeze({
  None: '0',
  Isda: '1',
  Afma: '2',
} as const);

/** `PaymentStreamFloorRateBuySide` values (`FIX::PaymentStreamFloorRateBuySide_*`). */
export const PaymentStreamFloorRateBuySide = /* @__PURE__ */ Object.freeze({
  Buyer: '1',
  Seller: '2',
} as const);

/** `PaymentStreamInflationInterpolationMethod` values (`FIX::PaymentStreamInflationInterpolationMethod_*`). */
export const PaymentStreamInflationInterpolationMethod = /* @__PURE__ */ Object.freeze({
  None: '0',
  LinearZeroYield: '1',
} as const);

/** `PaymentStreamInflationLagDayType` values (`FIX::PaymentStreamInflationLagDayType_*`). */
export const PaymentStreamInflationLagDayType = /* @__PURE__ */ Object.freeze({
  Business: '0',
  Calendar: '1',
  CommodityBusiness: '2',
  CurrencyBusiness: '3',
  ExchangeBusiness: '4',
  ScheduledTradingDay: '5',
} as const);

/** `PaymentStreamInflationLagUnit` values (`FIX::PaymentStreamInflationLagUnit_*`). */
export const PaymentStreamInflationLagUnit = /* @__PURE__ */ Object.freeze({
  Day: 'D',
  Week: 'Wk',
  Month: 'Mo',
  Year: 'Yr',
} as const);

/** `PaymentStreamInterpolationPeriod` values (`FIX::PaymentStreamInterpolationPeriod_*`). */
export const PaymentStreamInterpolationPeriod = /* @__PURE__ */ Object.freeze({
  Initial: '0',
  InitialAndFinal: '1',
  Final: '2',
  AnyPeriod: '3',
} as const);

/** `PaymentStreamLinkStrikePriceType` values (`FIX::PaymentStreamLinkStrikePriceType_*`). */
export const PaymentStreamLinkStrikePriceType = /* @__PURE__ */ Object.freeze({
  Volatility: '0',
  Variance: '1',
} as const);

/** `PaymentStreamNegativeRateTreatment` values (`FIX::PaymentStreamNegativeRateTreatment_*`). */
export const PaymentStreamNegativeRateTreatment = /* @__PURE__ */ Object.freeze({
  ZeroInterestRateMethod: '0',
  NegativeInterestRateMethod: '1',
} as const);

/** `PaymentStreamPaymentDateOffsetDayType` values (`FIX::PaymentStreamPaymentDateOffsetDayType_*`). */
export const PaymentStreamPaymentDateOffsetDayType = /* @__PURE__ */ Object.freeze({
  Business: '0',
  Calendar: '1',
  CommodityBusiness: '2',
  CurrencyBusiness: '3',
  ExchangeBusiness: '4',
  ScheduledTradingDay: '5',
} as const);

/** `PaymentStreamPaymentDateOffsetUnit` values (`FIX::PaymentStreamPaymentDateOffsetUnit_*`). */
export const PaymentStreamPaymentDateOffsetUnit = /* @__PURE__ */ Object.freeze({
  Day: 'D',
  Week: 'Wk',
  Month: 'Mo',
  Year: 'Yr',
} as const);

/** `PaymentStreamPaymentFrequencyUnit` values (`FIX::PaymentStreamPaymentFrequencyUnit_*`). */
export const PaymentStreamPaymentFrequencyUnit = /* @__PURE__ */ Object.freeze({
  Day: 'D',
  Week: 'Wk',
  Month: 'Mo',
  Year: 'Yr',
  Term: 'T',
} as const);

/** `PaymentStreamPricingDayDistribution` values (`FIX::PaymentStreamPricingDayDistribution_*`). */
export const PaymentStreamPricingDayDistribution = /* @__PURE__ */ Object.freeze({
  All: '0',
  First: '1',
  Last: '2',
  Penultimate: '3',
} as const);

/** `PaymentStreamPricingDayOfWeek` values (`FIX::PaymentStreamPricingDayOfWeek_*`). */
export const PaymentStreamPricingDayOfWeek = /* @__PURE__ */ Object.freeze({
  EveryDay: '0',
  Monday: '1',
  Tuesday: '2',
  Wednesday: '3',
  Thursday: '4',
  Friday: '5',
  Saturday: '6',
  Sunday: '7',
} as const);

/** `PaymentStreamRateIndexCurveUnit` values (`FIX::PaymentStreamRateIndexCurveUnit_*`). */
export const PaymentStreamRateIndexCurveUnit = /* @__PURE__ */ Object.freeze({
  Day: 'D',
  Week: 'Wk',
  Month: 'Mo',
  Year: 'Yr',
} as const);

/** `PaymentStreamRateIndexSource` values (`FIX::PaymentStreamRateIndexSource_*`). */
export const PaymentStreamRateIndexSource = /* @__PURE__ */ Object.freeze({
  Bloomberg: '0',
  Reuters: '1',
  Telerate: '2',
  Other: '99',
} as const);

/** `PaymentStreamRateSpreadPositionType` values (`FIX::PaymentStreamRateSpreadPositionType_*`). */
export const PaymentStreamRateSpreadPositionType = /* @__PURE__ */ Object.freeze({
  Short: '0',
  Long: '1',
} as const);

/** `PaymentStreamRateSpreadType` values (`FIX::PaymentStreamRateSpreadType_*`). */
export const PaymentStreamRateSpreadType = /* @__PURE__ */ Object.freeze({
  Absolute: '0',
  Percentage: '1',
} as const);

/** `PaymentStreamRateTreatment` values (`FIX::PaymentStreamRateTreatment_*`). */
export const PaymentStreamRateTreatment = /* @__PURE__ */ Object.freeze({
  BondEquivalentYield: '0',
  MoneyMarketYield: '1',
} as const);

/** `PaymentStreamRealizedVarianceMethod` values (`FIX::PaymentStreamRealizedVarianceMethod_*`). */
export const PaymentStreamRealizedVarianceMethod = /* @__PURE__ */ Object.freeze({
  Previous: '0',
  Last: '1',
  Both: '2',
} as const);

/** `PaymentStreamResetWeeklyRollConvention` values (`FIX::PaymentStreamResetWeeklyRollConvention_*`). */
export const PaymentStreamResetWeeklyRollConvention = /* @__PURE__ */ Object.freeze({
  Monday: 'MON',
  Tuesday: 'TUE',
  Wednesday: 'WED',
  Thursday: 'THU',
  Friday: 'FRI',
  Saturday: 'SAT',
  Sunday: 'SUN',
} as const);

/** `PaymentStreamSettlLevel` values (`FIX::PaymentStreamSettlLevel_*`). */
export const PaymentStreamSettlLevel = /* @__PURE__ */ Object.freeze({
  Average: '0',
  Maximum: '1',
  Minimum: '2',
  Cumulative: '3',
} as const);

/** `PaymentStreamType` values (`FIX::PaymentStreamType_*`). */
export const PaymentStreamType = /* @__PURE__ */ Object.freeze({
  Periodic: '0',
  Initial: '1',
  Single: '2',
  Dividend: '3',
  Interest: '4',
  DividendReturn: '5',
  PriceReturn: '6',
  TotalReturn: '7',
  Variance: '8',
  Correlation: '9',
} as const);

/** `PaymentStubLength` values (`FIX::PaymentStubLength_*`). */
export const PaymentStubLength = /* @__PURE__ */ Object.freeze({
  Short: '0',
  Long: '1',
} as const);

/** `PaymentStubType` values (`FIX::PaymentStubType_*`). */
export const PaymentStubType = /* @__PURE__ */ Object.freeze({
  Initial: '0',
  Final: '1',
  CompoundingInitial: '2',
  CompoundingFinal: '3',
} as const);

/** `PaymentSubType` values (`FIX::PaymentSubType_*`). */
export const PaymentSubType = /* @__PURE__ */ Object.freeze({
  Initial: '0',
  Intermediate: '1',
  Final: '2',
  Prepaid: '3',
  Postpaid: '4',
  Variable: '5',
  Fixed: '6',
  Swap: '7',
  Conditional: '8',
  FixedRate: '9',
  FloatingRate: '10',
} as const);

/** `PaymentType` values (`FIX::PaymentType_*`). */
export const PaymentType = /* @__PURE__ */ Object.freeze({
  Brokerage: '0',
  UpfrontFee: '1',
  IndependentAmountCollateral: '2',
  PrincipalExchange: '3',
  NovationTermination: '4',
  EarlyTerminationProvision: '5',
  CancelableProvision: '6',
  ExtendibleProvision: '7',
  CapRateProvision: '8',
  FloorRateProvision: '9',
  OptionPremium: '10',
  SettlementPayment: '11',
  CashSettl: '12',
  SecurityLending: '13',
  Rebate: '14',
  Other: '99',
} as const);

/** `PegLimitType` values (`FIX::PegLimitType_*`). */
export const PegLimitType = /* @__PURE__ */ Object.freeze({
  OrBetter: '0',
  Strict: '1',
  OrWorse: '2',
} as const);

/** `PegMoveType` values (`FIX::PegMoveType_*`). */
export const PegMoveType = /* @__PURE__ */ Object.freeze({
  Floating: '0',
  Fixed: '1',
} as const);

/** `PegOffsetType` values (`FIX::PegOffsetType_*`). */
export const PegOffsetType = /* @__PURE__ */ Object.freeze({
  Price: '0',
  BasisPoints: '1',
  Ticks: '2',
  PriceTier: '3',
  Percentage: '4',
} as const);

/** `PegPriceType` values (`FIX::PegPriceType_*`). */
export const PegPriceType = /* @__PURE__ */ Object.freeze({
  LastPeg: '1',
  MidPricePeg: '2',
  OpeningPeg: '3',
  MarketPeg: '4',
  PrimaryPeg: '5',
  FixedPegToLocalBestBidOrOfferAtTimeOfOrder: '6',
  PegToVwap: '7',
  TrailingStopPeg: '8',
  PegToLimitPrice: '9',
  ShortSaleMinPricePeg: '10',
} as const);

/** `PegRoundDirection` values (`FIX::PegRoundDirection_*`). */
export const PegRoundDirection = /* @__PURE__ */ Object.freeze({
  MoreAggressive: '1',
  MorePassive: '2',
} as const);

/** `PegScope` values (`FIX::PegScope_*`). */
export const PegScope = /* @__PURE__ */ Object.freeze({
  Local: '1',
  National: '2',
  Global: '3',
  NationalExcludingLocal: '4',
} as const);

/** `PosAmtReason` values (`FIX::PosAmtReason_*`). */
export const PosAmtReason = /* @__PURE__ */ Object.freeze({
  OptionsSettlement: '0',
  PendingErosionAdjustment: '1',
  FinalErosionAdjustment: '2',
  TearUpCouponAmount: '3',
  PriceAlignmentInterest: '4',
  DeliveryInvoiceCharges: '5',
  DeliveryStorageCharges: '6',
} as const);

/** `PosAmtType` values (`FIX::PosAmtType_*`). */
export const PosAmtType = /* @__PURE__ */ Object.freeze({
  FinalMarkToMarketAmount: 'FMTM',
  IncrementalMarkToMarketAmount: 'IMTM',
  TradeVariationAmount: 'TVAR',
  StartOfDayMarkToMarketAmount: 'SMTM',
  PremiumAmount: 'PREM',
  CashResidualAmount: 'CRES',
  CashAmount: 'CASH',
  ValueAdjustedAmount: 'VADJ',
  SettlementValue: 'SETL',
  InitialTradeCouponAmount: 'ICPN',
  AccruedCouponAmount: 'ACPN',
  CouponAmount: 'CPN',
  IncrementalAccruedCoupon: 'IACPN',
  CollateralizedMarkToMarket: 'CMTM',
  IncrementalCollateralizedMarkToMarket: 'ICMTM',
  CompensationAmount: 'DLV',
  TotalBankedAmount: 'BANK',
  TotalCollateralizedAmount: 'COLAT',
  LongPairedSwapNotionalValue: 'LSNV',
  ShortPairedSwapNotionalValue: 'SSNV',
  StartOfDayAccruedCoupon: 'SACPN',
  NetPresentValue: 'NPV',
  StartOfDayNetPresentValue: 'SNPV',
  NetCashFlow: 'NCF',
  PresentValueOfFees: 'PVFEES',
  PresentValueOneBasisPoints: 'PV01',
  FiveYearEquivalentNotional: '5YREN',
  UndiscountedMarkToMarket: 'UMTM',
  MarkToModel: 'MTD',
  MarkToMarketVariance: 'VMTM',
  MarkToModelVariance: 'VMTD',
  UpfrontPayment: 'UPFRNT',
  EndVale: 'ENDV',
  OutstandingMarginLoan: 'MGNLN',
  LoanValue: 'LNVL',
} as const);

/** `PosMaintAction` values (`FIX::PosMaintAction_*`). */
export const PosMaintAction = /* @__PURE__ */ Object.freeze({
  New: '1',
  Replace: '2',
  Cancel: '3',
  Reverse: '4',
} as const);

/** `PosMaintResult` values (`FIX::PosMaintResult_*`). */
export const PosMaintResult = /* @__PURE__ */ Object.freeze({
  SuccessfulCompletion: '0',
  Rejected: '1',
  Other: '99',
} as const);

/** `PosMaintStatus` values (`FIX::PosMaintStatus_*`). */
export const PosMaintStatus = /* @__PURE__ */ Object.freeze({
  Accepted: '0',
  AcceptedWithWarnings: '1',
  Rejected: '2',
  Completed: '3',
  CompletedWithWarnings: '4',
} as const);

/** `PosQtyStatus` values (`FIX::PosQtyStatus_*`). */
export const PosQtyStatus = /* @__PURE__ */ Object.freeze({
  Submitted: '0',
  Accepted: '1',
  Rejected: '2',
} as const);

/** `PosReqResult` values (`FIX::PosReqResult_*`). */
export const PosReqResult = /* @__PURE__ */ Object.freeze({
  ValidRequest: '0',
  InvalidOrUnsupportedRequest: '1',
  NoPositionsFoundThatMatchCriteria: '2',
  NotAuthorizedToRequestPositions: '3',
  RequestForPositionNotSupported: '4',
  Other: '99',
} as const);

/** `PosReqStatus` values (`FIX::PosReqStatus_*`). */
export const PosReqStatus = /* @__PURE__ */ Object.freeze({
  Completed: '0',
  CompletedWithWarnings: '1',
  Rejected: '2',
} as const);

/** `PosReqType` values (`FIX::PosReqType_*`). */
export const PosReqType = /* @__PURE__ */ Object.freeze({
  Positions: '0',
  Trades: '1',
  Exercises: '2',
  Assignments: '3',
  SettlementActivity: '4',
  BackoutMessage: '5',
  DeltaPositions: '6',
  NetPosition: '7',
  LargePositionsReporting: '8',
  ExercisePositionReportingSubmission: '9',
  PositionLimitReportingSubmissing: '10',
} as const);

/** `PosTransType` values (`FIX::PosTransType_*`). */
export const PosTransType = /* @__PURE__ */ Object.freeze({
  Exercise: '1',
  DoNotExercise: '2',
  PositionAdjustment: '3',
  PositionChangeSubmission: '4',
  Pledge: '5',
  LargeTraderSubmission: '6',
  LargePositionsReportingSubmission: '7',
  LongHoldings: '8',
  InternalTransfer: '9',
  TransferOfFirm: '10',
  ExternalTransfer: '11',
  CorporateAction: '12',
  Notification: '13',
  PositionCreation: '14',
  Closeout: '15',
  Reopen: '16',
} as const);

/** `PosType` values (`FIX::PosType_*`). */
export const PosType = /* @__PURE__ */ Object.freeze({
  TransactionQuantity: 'TQ',
  IntraSpreadQty: 'IAS',
  InterSpreadQty: 'IES',
  EndOfDayQty: 'FIN',
  StartOfDayQty: 'SOD',
  OptionExerciseQty: 'EX',
  OptionAssignment: 'AS',
  TransactionFromExercise: 'TX',
  TransactionFromAssignment: 'TA',
  PitTradeQty: 'PIT',
  TransferTradeQty: 'TRF',
  ElectronicTradeQty: 'ETR',
  AllocationTradeQty: 'ALC',
  AdjustmentQty: 'PA',
  AsOfTradeQty: 'ASF',
  DeliveryQty: 'DLV',
  TotalTransactionQty: 'TOT',
  CrossMarginQty: 'XM',
  IntegralSplit: 'SPL',
  ReceiveQuantity: 'RCV',
  CorporateActionAdjustment: 'CAA',
  DeliveryNoticeQty: 'DN',
  ExchangeForPhysicalQty: 'EP',
  PrivatelyNegotiatedTradeQty: 'PNTN',
  NetDeltaQty: 'DLT',
  CreditEventAdjustment: 'CEA',
  SuccessionEventAdjustment: 'SEA',
  NetQty: 'NET',
  GrossQty: 'GRS',
  IntradayQty: 'ITD',
  GrossLongNonDeltaAdjustedSwaptionPosition: 'NDAS',
  LongDeltaAdjustedPairedSwaptionPosition: 'DAS',
  ExpiringQuantity: 'EXP',
  QuantityNotExercised: 'UNEX',
  RequestedExerciseQuantity: 'REQ',
  CashFuturesEquivalentQuantity: 'CFE',
  LoanOrBorrowedQuantity: 'SECLN',
} as const);

/** `PositionCapacity` values (`FIX::PositionCapacity_*`). */
export const PositionCapacity = /* @__PURE__ */ Object.freeze({
  Principal: '0',
  Agent: '1',
  Customer: '2',
  Counterparty: '3',
} as const);

/** `PositionEffect` values (`FIX::PositionEffect_*`). */
export const PositionEffect = /* @__PURE__ */ Object.freeze({
  Fifo: 'F',
  Rolled: 'R',
  Close: 'C',
  Open: 'O',
  CloseButNotifyOnOpen: 'N',
  Default: 'D',
} as const);

/** `PossDupFlag` values (`FIX::PossDupFlag_*`). */
export const PossDupFlag = /* @__PURE__ */ Object.freeze({
  No: 'N',
  Yes: 'Y',
} as const);

/** `PossResend` values (`FIX::PossResend_*`). */
export const PossResend = /* @__PURE__ */ Object.freeze({
  No: 'N',
  Yes: 'Y',
} as const);

/** `PostTradePaymentDebitOrCredit` values (`FIX::PostTradePaymentDebitOrCredit_*`). */
export const PostTradePaymentDebitOrCredit = /* @__PURE__ */ Object.freeze({
  DebitPay: '0',
  CreditReceive: '1',
} as const);

/** `PostTradePaymentStatus` values (`FIX::PostTradePaymentStatus_*`). */
export const PostTradePaymentStatus = /* @__PURE__ */ Object.freeze({
  New: '0',
  Initiated: '1',
  Pending: '2',
  Confirmed: '3',
  Rejected: '4',
} as const);

/** `PreallocMethod` values (`FIX::PreallocMethod_*`). */
export const PreallocMethod = /* @__PURE__ */ Object.freeze({
  ProRata: '0',
  DoNotProRata: '1',
} as const);

/** `PreviouslyReported` values (`FIX::PreviouslyReported_*`). */
export const PreviouslyReported = /* @__PURE__ */ Object.freeze({
  No: 'N',
  Yes: 'Y',
} as const);

/** `PriceLimitType` values (`FIX::PriceLimitType_*`). */
export const PriceLimitType = /* @__PURE__ */ Object.freeze({
  Price: '0',
  Ticks: '1',
  Percentage: '2',
} as const);

/** `PriceMovementType` values (`FIX::PriceMovementType_*`). */
export const PriceMovementType = /* @__PURE__ */ Object.freeze({
  Amount: '0',
  Percentage: '1',
} as const);

/** `PriceProtectionScope` values (`FIX::PriceProtectionScope_*`). */
export const PriceProtectionScope = /* @__PURE__ */ Object.freeze({
  None: '0',
  Local: '1',
  National: '2',
  Global: '3',
} as const);

/** `PriceQualifier` values (`FIX::PriceQualifier_*`). */
export const PriceQualifier = /* @__PURE__ */ Object.freeze({
  AccruedInterestIsFactored: '0',
  TaxIsFactored: '1',
  BondAmortizationIsFactored: '2',
} as const);

/** `PriceQuoteMethod` values (`FIX::PriceQuoteMethod_*`). */
export const PriceQuoteMethod = /* @__PURE__ */ Object.freeze({
  Standard: 'STD',
  Index: 'INX',
  InterestRateIndex: 'INT',
  PercentOfPar: 'PCTPAR',
} as const);

/** `PriceType` values (`FIX::PriceType_*`). */
export const PriceType = /* @__PURE__ */ Object.freeze({
  Percentage: '1',
  PerUnit: '2',
  FixedAmount: '3',
  Discount: '4',
  Spread: '6',
  TedPrice: '7',
  TedYield: '8',
  Premium: '5',
  Yield: '9',
  FixedCabinetTradePrice: '10',
  VariableCabinetTradePrice: '11',
  ProductTicksInHalfs: '13',
  ProductTicksInFourths: '14',
  ProductTicksInEights: '15',
  ProductTicksInSixteenths: '16',
  ProductTicksInThirtySeconds: '17',
  ProductTicksInSixtyForths: '18',
  ProductTicksInOneTwentyEights: '19',
  PriceSpread: '12',
  ProductTicksInHalves: '13',
  ProductTicksInEighths: '15',
  ProductTicksInSixtyFourths: '18',
  ProductTicksInOneTwentyEighths: '19',
  NormalRateRepresentation: '20',
  InverseRateRepresentation: '21',
  BasisPoints: '22',
  UpfrontPoints: '23',
  InterestRate: '24',
  PercentageNotional: '25',
} as const);

/** `PriorityIndicator` values (`FIX::PriorityIndicator_*`). */
export const PriorityIndicator = /* @__PURE__ */ Object.freeze({
  PriorityUnchanged: '0',
  LostPriorityAsResultOfOrderChange: '1',
} as const);

/** `PrivateQuote` values (`FIX::PrivateQuote_*`). */
export const PrivateQuote = /* @__PURE__ */ Object.freeze({
  Yes: 'Y',
  No: 'N',
} as const);

/** `ProcessCode` values (`FIX::ProcessCode_*`). */
export const ProcessCode = /* @__PURE__ */ Object.freeze({
  Regular: '0',
  SoftDollar: '1',
  StepIn: '2',
  StepOut: '3',
  SoftDollarStepIn: '4',
  SoftDollarStepOut: '5',
  PlanSponsor: '6',
} as const);

/** `Product` values (`FIX::Product_*`). */
export const Product = /* @__PURE__ */ Object.freeze({
  Loan: '8',
  Other: '12',
  Municipal: '11',
  Agency: '1',
  Corporate: '3',
  Currency: '4',
  Commodity: '2',
  Government: '6',
  Mortgage: '10',
  Index: '7',
  Moneymarket: '9',
  Equity: '5',
  Financing: '13',
} as const);

/** `ProgRptReqs` values (`FIX::ProgRptReqs_*`). */
export const ProgRptReqs = /* @__PURE__ */ Object.freeze({
  BuySideRequests: '1',
  SellSideSends: '2',
  RealTimeExecutionReports: '3',
} as const);

/** `ProtectionTermEventDayType` values (`FIX::ProtectionTermEventDayType_*`). */
export const ProtectionTermEventDayType = /* @__PURE__ */ Object.freeze({
  Business: '0',
  Calendar: '1',
  CommodityBusiness: '2',
  CurrencyBusiness: '3',
  ExchangeBusiness: '4',
  ScheduledTradingDay: '5',
} as const);

/** `ProtectionTermEventQualifier` values (`FIX::ProtectionTermEventQualifier_*`). */
export const ProtectionTermEventQualifier = /* @__PURE__ */ Object.freeze({
  RestructuringMultipleHoldingObligations: 'H',
  RestructuringMultipleCreditEventNotices: 'E',
  FloatingRateInterestShortfall: 'C',
} as const);

/** `ProtectionTermEventUnit` values (`FIX::ProtectionTermEventUnit_*`). */
export const ProtectionTermEventUnit = /* @__PURE__ */ Object.freeze({
  Day: 'D',
  Week: 'Wk',
  Month: 'Mo',
  Year: 'Yr',
} as const);

/** `ProvisionBreakFeeElection` values (`FIX::ProvisionBreakFeeElection_*`). */
export const ProvisionBreakFeeElection = /* @__PURE__ */ Object.freeze({
  FlatFee: '0',
  AmortizedFee: '1',
  FundingFee: '2',
  FlatAndFundingFee: '3',
  AmortizedAndFundingFee: '4',
} as const);

/** `ProvisionCalculationAgent` values (`FIX::ProvisionCalculationAgent_*`). */
export const ProvisionCalculationAgent = /* @__PURE__ */ Object.freeze({
  ExercisingParty: '0',
  NonExercisingParty: '1',
  MasterAgreeent: '2',
  Supplement: '3',
} as const);

/** `ProvisionCashSettlMethod` values (`FIX::ProvisionCashSettlMethod_*`). */
export const ProvisionCashSettlMethod = /* @__PURE__ */ Object.freeze({
  CashPrice: '0',
  CashPriceAlternate: '1',
  ParYieldCurveAdjusted: '2',
  ZeroCouponYieldCurveAdjusted: '3',
  ParYieldCurveUnadjusted: '4',
  CrossCurrency: '5',
  CollateralizedPrice: '6',
} as const);

/** `ProvisionCashSettlPaymentDateType` values (`FIX::ProvisionCashSettlPaymentDateType_*`). */
export const ProvisionCashSettlPaymentDateType = /* @__PURE__ */ Object.freeze({
  Unadjusted: '0',
  Adjusted: '1',
} as const);

/** `ProvisionCashSettlQuoteType` values (`FIX::ProvisionCashSettlQuoteType_*`). */
export const ProvisionCashSettlQuoteType = /* @__PURE__ */ Object.freeze({
  Bid: '0',
  Mid: '1',
  Offer: '2',
  ExercisingPartyPays: '3',
} as const);

/** `ProvisionDateTenorUnit` values (`FIX::ProvisionDateTenorUnit_*`). */
export const ProvisionDateTenorUnit = /* @__PURE__ */ Object.freeze({
  Day: 'D',
  Week: 'Wk',
  Month: 'Mo',
  Year: 'Yr',
} as const);

/** `ProvisionOptionExerciseEarliestDateOffsetUnit` values (`FIX::ProvisionOptionExerciseEarliestDateOffsetUnit_*`). */
export const ProvisionOptionExerciseEarliestDateOffsetUnit = /* @__PURE__ */ Object.freeze({
  Day: 'D',
  Week: 'Wk',
  Month: 'Mo',
  Year: 'Yr',
} as const);

/** `ProvisionOptionExerciseFixedDateType` values (`FIX::ProvisionOptionExerciseFixedDateType_*`). */
export const ProvisionOptionExerciseFixedDateType = /* @__PURE__ */ Object.freeze({
  Unadjusted: '0',
  Adjusted: '1',
} as const);

/** `ProvisionOptionSinglePartyBuyerSide` values (`FIX::ProvisionOptionSinglePartyBuyerSide_*`). */
export const ProvisionOptionSinglePartyBuyerSide = /* @__PURE__ */ Object.freeze({
  Buy: '1',
  Sell: '2',
} as const);

/** `ProvisionType` values (`FIX::ProvisionType_*`). */
export const ProvisionType = /* @__PURE__ */ Object.freeze({
  MandatoryEarlyTermination: '0',
  OptionalEarlyTermination: '1',
  Cancelable: '2',
  Extendable: '3',
  MutualEarlyTermination: '4',
  Evergreen: '5',
  Callable: '6',
  Puttable: '7',
} as const);

/** `PublishTrdIndicator` values (`FIX::PublishTrdIndicator_*`). */
export const PublishTrdIndicator = /* @__PURE__ */ Object.freeze({
  Yes: 'Y',
  No: 'N',
} as const);

/** `PutOrCall` values (`FIX::PutOrCall_*`). */
export const PutOrCall = /* @__PURE__ */ Object.freeze({
  Put: '0',
  Call: '1',
  Other: '2',
  Chooser: '3',
} as const);

/** `QtyType` values (`FIX::QtyType_*`). */
export const QtyType = /* @__PURE__ */ Object.freeze({
  Units: '0',
  Contracts: '1',
  UnitsOfMeasurePerTimeUnit: '2',
} as const);

/** `QuantityType` values (`FIX::QuantityType_*`). */
export const QuantityType = /* @__PURE__ */ Object.freeze({
  Contracts: '6',
  Other: '7',
  Currency: '5',
  Originalface: '4',
  Currentface: '3',
  Bonds: '2',
  Shares: '1',
  Par: '8',
} as const);

/** `QuoteAckStatus` values (`FIX::QuoteAckStatus_*`). */
export const QuoteAckStatus = /* @__PURE__ */ Object.freeze({
  ReceivedNotYetProcessed: '0',
  Accepted: '1',
  Rejected: '2',
} as const);

/** `QuoteAttributeType` values (`FIX::QuoteAttributeType_*`). */
export const QuoteAttributeType = /* @__PURE__ */ Object.freeze({
  QuoteAboveStandardMarketSize: '0',
  QuoteAboveSpecificInstrumentSize: '1',
  QuoteApplicableForLiquidtyProvisionActivity: '2',
  QuoteIssuerStatus: '3',
  BidOrAskRequest: '4',
} as const);

/** `QuoteCancelType` values (`FIX::QuoteCancelType_*`). */
export const QuoteCancelType = /* @__PURE__ */ Object.freeze({
  CancelForOneOrMoreSecurities: '1',
  CancelForSecurityType: '2',
  CancelForUnderlyingSecurity: '3',
  CancelAllQuotes: '4',
  CancelQuoteSpecifiedInQuoteId: '5',
  CancelSpecifiedSingleQuote: '5',
  CancelByTypeOfQuote: '6',
  CancelForSecurityIssuer: '7',
  CancelForIssuerOfUnderlyingSecurity: '8',
} as const);

/** `QuoteCondition` values (`FIX::QuoteCondition_*`). */
export const QuoteCondition = /* @__PURE__ */ Object.freeze({
  Open: 'A',
  Closed: 'B',
  ExchangeBest: 'C',
  ConsolidatedBest: 'D',
  Locked: 'E',
  Crossed: 'F',
  Depth: 'G',
  FastTrading: 'H',
  NonFirm: 'I',
  Manual: 'L',
  OutrightPrice: 'J',
  ImpliedPrice: 'K',
  DepthOnOffer: 'M',
  DepthOnBid: 'N',
  Closing: 'O',
  NewsDissemination: 'P',
  TradingRange: 'Q',
  OrderInflux: 'R',
  DueToRelated: 'S',
  NewsPending: 'T',
  AdditionalInfo: 'U',
  AdditionalInfoDueToRelated: 'V',
  Resume: 'W',
  ViewOfCommon: 'X',
  VolumeAlert: 'Y',
  OrderImbalance: 'Z',
  EquipmentChangeover: 'a',
  NoOpen: 'b',
  RegularEth: 'c',
  AutomaticExecution: 'd',
  AutomaticExecutionEth: 'e',
  FastMarketEth: 'f',
  InactiveEth: 'g',
  Rotation: 'h',
  RotationEth: 'i',
  Halt: 'j',
  HaltEth: 'k',
  DueToNewsDissemination: 'l',
  DueToNewsPending: 'm',
  TradingResume: 'n',
  OutOfSequence: 'o',
  BidSpecialist: 'p',
  OfferSpecialist: 'q',
  BidOfferSpecialist: 'r',
  EndOfDaySam: 's',
  ForbiddenSam: 't',
  FrozenSam: 'u',
  PreOpeningSam: 'v',
  OpeningSam: 'w',
  OpenSam: 'x',
  SurveillanceSam: 'y',
  SuspendedSam: 'z',
  ReservedSam: '0',
  NoActiveSam: '1',
  Restricted: '2',
  RestOfBookVwap: '3',
  BetterPricesInConditionalOrders: '4',
  MedianPrice: '5',
  FullCurve: '6',
  FlatCurve: '7',
} as const);

/** `QuoteEntryRejectReason` values (`FIX::QuoteEntryRejectReason_*`). */
export const QuoteEntryRejectReason = /* @__PURE__ */ Object.freeze({
  UnknownSymbol: '1',
  Exchange: '2',
  QuoteExceedsLimit: '3',
  TooLateToEnter: '4',
  UnknownQuote: '5',
  DuplicateQuote: '6',
  InvalidBidAskSpread: '7',
  InvalidPrice: '8',
  NotAuthorizedToQuoteSecurity: '9',
} as const);

/** `QuoteEntryStatus` values (`FIX::QuoteEntryStatus_*`). */
export const QuoteEntryStatus = /* @__PURE__ */ Object.freeze({
  Accepted: '0',
  Rejected: '5',
  RemovedFromMarket: '6',
  Expired: '7',
  LockedMarketWarning: '12',
  CrossMarketWarning: '13',
  CanceledDueToLockMarket: '14',
  CanceledDueToCrossMarket: '15',
  Active: '16',
} as const);

/** `QuoteModelType` values (`FIX::QuoteModelType_*`). */
export const QuoteModelType = /* @__PURE__ */ Object.freeze({
  QuoteEntry: '1',
  QuoteModification: '2',
} as const);

/** `QuotePriceType` values (`FIX::QuotePriceType_*`). */
export const QuotePriceType = /* @__PURE__ */ Object.freeze({
  Percent: '1',
  PerShare: '2',
  FixedAmount: '3',
  Discount: '4',
  Premium: '5',
  Spread: '6',
  TedPrice: '7',
  TedYield: '8',
  YieldSpread: '9',
  Yield: '10',
  PriceSpread: '12',
  ProductTicksInHalves: '13',
  ProductTicksInFourths: '14',
  ProductTicksInEighths: '15',
  ProductTicksInSixteenths: '16',
  ProductTicksInThirtySeconds: '17',
  ProductTicksInSixtyFourths: '18',
  ProductTicksInOneTwentyEighths: '19',
  NormalRateRepresentation: '20',
  InverseRateRepresentation: '21',
  BasisPoints: '22',
  UpFrontPoints: '23',
  InterestRate: '24',
  PercentageOfNotional: '25',
} as const);

/** `QuoteRejectReason` values (`FIX::QuoteRejectReason_*`). */
export const QuoteRejectReason = /* @__PURE__ */ Object.freeze({
  UnknownSymbol: '1',
  Exchange: '2',
  QuoteRequestExceedsLimit: '3',
  TooLateToEnter: '4',
  UnknownQuote: '5',
  DuplicateQuote: '6',
  InvalidBid: '7',
  InvalidPrice: '8',
  NotAuthorizedToQuoteSecurity: '9',
  Other: '99',
  PriceExceedsCurrentPriceBand: '10',
  QuoteLocked: '11',
  InvalidOrUnknownSecurityIssuer: '12',
  InvalidOrUnknownIssuerOfUnderlyingSecurity: '13',
  NotionalValueExceedsThreshold: '14',
  PriceExceedsCurrentPriceBandDepr: '15',
  ReferencePriceNotAvailable: '16',
  InsufficientCreditLimit: '17',
  ExceededClipSizeLimit: '18',
  ExceededMaxNotionalOrderAmt: '19',
  ExceededDv01Pv01Limit: '20',
  ExceededCs01Limit: '21',
} as const);

/** `QuoteRequestRejectReason` values (`FIX::QuoteRequestRejectReason_*`). */
export const QuoteRequestRejectReason = /* @__PURE__ */ Object.freeze({
  UnknownSymbol: '1',
  Exchange: '2',
  QuoteRequestExceedsLimit: '3',
  TooLateToEnter: '4',
  InvalidPrice: '5',
  NotAuthorizedToRequestQuote: '6',
  NoMatchForInquiry: '7',
  NoMarketForInstrument: '8',
  NoInventory: '9',
  Pass: '10',
  Other: '99',
  InsufficientCredit: '11',
  ExceededClipSizeLimit: '12',
  ExceededMaxNotionalOrderAmt: '13',
  ExceededDv01Pv01Limit: '14',
  ExceededCs01Limit: '15',
} as const);

/** `QuoteRequestType` values (`FIX::QuoteRequestType_*`). */
export const QuoteRequestType = /* @__PURE__ */ Object.freeze({
  Manual: '1',
  Automatic: '2',
  ConfirmQuote: '3',
} as const);

/** `QuoteRespType` values (`FIX::QuoteRespType_*`). */
export const QuoteRespType = /* @__PURE__ */ Object.freeze({
  Hit: '1',
  Counter: '2',
  Expired: '3',
  Cover: '4',
  DoneAway: '5',
  Pass: '6',
  EndTrade: '7',
  TimedOut: '8',
  Tied: '9',
  TiedCover: '10',
  Accept: '11',
  TerminateContract: '12',
} as const);

/** `QuoteResponseLevel` values (`FIX::QuoteResponseLevel_*`). */
export const QuoteResponseLevel = /* @__PURE__ */ Object.freeze({
  NoAcknowledgement: '0',
  AcknowledgeOnlyNegativeOrErroneousQuotes: '1',
  AcknowledgeEachQuoteMessage: '2',
  SummaryAcknowledgement: '3',
} as const);

/** `QuoteSideIndicator` values (`FIX::QuoteSideIndicator_*`). */
export const QuoteSideIndicator = /* @__PURE__ */ Object.freeze({
  No: 'N',
  Yes: 'Y',
} as const);

/** `QuoteStatus` values (`FIX::QuoteStatus_*`). */
export const QuoteStatus = /* @__PURE__ */ Object.freeze({
  RemovedFromMarket: '6',
  CancelForSymbol: '1',
  Pending: '10',
  QuoteNotFound: '9',
  Query: '8',
  Expired: '7',
  Rejected: '5',
  CanceledAll: '4',
  CanceledForUnderlying: '3',
  CanceledForSecurityType: '2',
  Accepted: '0',
  Pass: '11',
  LockedMarketWarning: '12',
  CrossMarketWarning: '13',
  CanceledDueToLockMarket: '14',
  CanceledDueToCrossMarket: '15',
  Active: '16',
  Canceled: '17',
  UnsolicitedQuoteReplenishment: '18',
  PendingEndTrade: '19',
  TooLateToEnd: '20',
  Traded: '21',
  TradedAndRemoved: '22',
  ContractTerminates: '23',
} as const);

/** `QuoteType` values (`FIX::QuoteType_*`). */
export const QuoteType = /* @__PURE__ */ Object.freeze({
  Indicative: '0',
  Tradeable: '1',
  RestrictedTradeable: '2',
  Counter: '3',
  InitiallyTradeable: '4',
} as const);

/** `RateSource` values (`FIX::RateSource_*`). */
export const RateSource = /* @__PURE__ */ Object.freeze({
  Bloomberg: '0',
  Reuters: '1',
  Telerate: '2',
  IsdaRateOption: '3',
  Other: '99',
} as const);

/** `RateSourceType` values (`FIX::RateSourceType_*`). */
export const RateSourceType = /* @__PURE__ */ Object.freeze({
  Primary: '0',
  Secondary: '1',
} as const);

/** `RefOrdIDReason` values (`FIX::RefOrdIDReason_*`). */
export const RefOrdIDReason = /* @__PURE__ */ Object.freeze({
  GtcFromPreviousDay: '0',
  PartialFillRemaining: '1',
  OrderChanged: '2',
} as const);

/** `RefOrderIDSource` values (`FIX::RefOrderIDSource_*`). */
export const RefOrderIDSource = /* @__PURE__ */ Object.freeze({
  SecondaryOrderId: '0',
  OrderId: '1',
  MdEntryId: '2',
  QuoteEntryId: '3',
  OriginalOrderId: '4',
  QuoteId: '5',
  QuoteReqId: '6',
  PreviousOrderIdentifier: '7',
  PreviousQuoteIdentifier: '8',
  ParentOrderIdentifier: '9',
  ManualOrderIdentifier: 'A',
} as const);

/** `RefRiskLimitCheckIDType` values (`FIX::RefRiskLimitCheckIDType_*`). */
export const RefRiskLimitCheckIDType = /* @__PURE__ */ Object.freeze({
  RiskLimitRequestId: '0',
  RiskLimitCheckId: '1',
  OutOfBandId: '3',
} as const);

/** `ReferenceDataDateType` values (`FIX::ReferenceDataDateType_*`). */
export const ReferenceDataDateType = /* @__PURE__ */ Object.freeze({
  AdmitToTradeRequestDate: '0',
  AdmitToTradeApprovalDate: '1',
  AdmitToTradeOrFirstTradeDate: '2',
  TerminationDate: '3',
} as const);

/** `ReferenceEntityType` values (`FIX::ReferenceEntityType_*`). */
export const ReferenceEntityType = /* @__PURE__ */ Object.freeze({
  Asian: '1',
  AustralianNewZealand: '2',
  EuropeanEmergingMarkets: '3',
  Japanese: '4',
  NorthAmericanHighYield: '5',
  NorthAmericanInsurance: '6',
  NorthAmericanInvestmentGrade: '7',
  Singaporean: '8',
  WesternEuropean: '9',
  WesternEuropeanInsurance: '10',
} as const);

/** `RegistRejReasonCode` values (`FIX::RegistRejReasonCode_*`). */
export const RegistRejReasonCode = /* @__PURE__ */ Object.freeze({
  InvalidDistribInstns: '13',
  InvalidAgentCode: '17',
  InvalidAccountName: '16',
  NoRegDetails: '4',
  InvalidPaymentMethod: '15',
  InvalidPercentage: '14',
  InvalidOwnershipType: '3',
  InvalidTaxExemptType: '2',
  InvalidCountry: '12',
  InvalidDateOfBirth: '11',
  InvalidInvestorIdSource: '10',
  InvalidInvestorId: '9',
  InvalidMailingInstructions: '8',
  InvalidMailingDetails: '7',
  InvalidRegSeqNo: '5',
  InvalidAccountType: '1',
  InvalidAccountNum: '18',
  InvalidRegDetails: '6',
  Other: '99',
} as const);

/** `RegistStatus` values (`FIX::RegistStatus_*`). */
export const RegistStatus = /* @__PURE__ */ Object.freeze({
  Accepted: 'A',
  Reminder: 'N',
  Rejected: 'R',
  Held: 'H',
} as const);

/** `RegistTransType` values (`FIX::RegistTransType_*`). */
export const RegistTransType = /* @__PURE__ */ Object.freeze({
  Cancel: '2',
  New: '0',
  Replace: '1',
} as const);

/** `RegulatoryReportType` values (`FIX::RegulatoryReportType_*`). */
export const RegulatoryReportType = /* @__PURE__ */ Object.freeze({
  Rt: '0',
  Pet: '1',
  Snapshot: '2',
  Confirmation: '3',
  Rtpet: '4',
  PetConfirmation: '5',
  RtpetConfirmation: '6',
  PostTrade: '7',
  Verification: '8',
  PstTrdEvnt: '9',
  PstTrdEvntRtReportable: '10',
  Lmtf: '11',
  Datf: '12',
  Volo: '13',
  Fwaf: '14',
  Idaf: '15',
  Volw: '16',
  Fulf: '17',
  Fula: '18',
  Fulv: '19',
  Fulj: '20',
  Coaf: '21',
  Order: '22',
  ChildOrder: '23',
  OrderRoute: '24',
  Trade: '25',
  Quote: '26',
  Supplement: '27',
  NewTransaction: '28',
  TransactionCorrection: '29',
  TransactionModification: '30',
  CollateralUpdate: '31',
  MarginUpdate: '32',
  TransactionReportedInError: '33',
  TerminationEarlyTermination: '34',
} as const);

/** `RegulatoryTradeIDEvent` values (`FIX::RegulatoryTradeIDEvent_*`). */
export const RegulatoryTradeIDEvent = /* @__PURE__ */ Object.freeze({
  InitialBlockTrade: '0',
  Allocation: '1',
  Clearing: '2',
  Compression: '3',
  Novation: '4',
  Termination: '5',
  PostTrdVal: '6',
} as const);

/** `RegulatoryTradeIDScope` values (`FIX::RegulatoryTradeIDScope_*`). */
export const RegulatoryTradeIDScope = /* @__PURE__ */ Object.freeze({
  ClearingMember: '1',
  Client: '2',
} as const);

/** `RegulatoryTradeIDSource` values (`FIX::RegulatoryTradeIDSource_*`). */
export const RegulatoryTradeIDSource = /* @__PURE__ */ Object.freeze({
  UniqueTransactionIdentifier: '1',
} as const);

/** `RegulatoryTradeIDType` values (`FIX::RegulatoryTradeIDType_*`). */
export const RegulatoryTradeIDType = /* @__PURE__ */ Object.freeze({
  Current: '0',
  Previous: '1',
  Block: '2',
  Related: '3',
  ClearedBlockTrade: '4',
  TradingVenueTransactionIdentifier: '5',
} as const);

/** `RegulatoryTransactionType` values (`FIX::RegulatoryTransactionType_*`). */
export const RegulatoryTransactionType = /* @__PURE__ */ Object.freeze({
  None: '0',
  SefRequiredTransaction: '1',
  SefPermittedTransaction: '2',
} as const);

/** `RelatedInstrumentType` values (`FIX::RelatedInstrumentType_*`). */
export const RelatedInstrumentType = /* @__PURE__ */ Object.freeze({
  HedgesForInstrument: '1',
  Underlier: '2',
  EquityEquivalent: '3',
  NearestExchangeTradedContract: '4',
  RetailEquivalent: '5',
  Leg: '6',
} as const);

/** `RelatedOrderIDSource` values (`FIX::RelatedOrderIDSource_*`). */
export const RelatedOrderIDSource = /* @__PURE__ */ Object.freeze({
  NonFixSource: '0',
  SystemOrderIdentifier: '1',
  ClientOrderIdentifier: '2',
  SecondaryOrderIdentifier: '3',
  SecondaryClientOrderIdentifier: '4',
} as const);

/** `RelatedPositionIDSource` values (`FIX::RelatedPositionIDSource_*`). */
export const RelatedPositionIDSource = /* @__PURE__ */ Object.freeze({
  PosMaintRptId: '1',
  TransferId: '2',
  PositionEntityId: '3',
} as const);

/** `RelatedPriceSource` values (`FIX::RelatedPriceSource_*`). */
export const RelatedPriceSource = /* @__PURE__ */ Object.freeze({
  NbBid: '1',
  NbOffer: '2',
} as const);

/** `RelatedTradeIDSource` values (`FIX::RelatedTradeIDSource_*`). */
export const RelatedTradeIDSource = /* @__PURE__ */ Object.freeze({
  NonFixSource: '0',
  TradeId: '1',
  SecondaryTradeId: '2',
  TradeReportId: '3',
  FirmTradeId: '4',
  SecondaryFirmTradeId: '5',
  RegulatoryTradeId: '6',
} as const);

/** `RelativeValueSide` values (`FIX::RelativeValueSide_*`). */
export const RelativeValueSide = /* @__PURE__ */ Object.freeze({
  Bid: '1',
  Mid: '2',
  Offer: '3',
} as const);

/** `RelativeValueType` values (`FIX::RelativeValueType_*`). */
export const RelativeValueType = /* @__PURE__ */ Object.freeze({
  AswSpread: '1',
  Ois: '2',
  ZSpread: '3',
  DiscountMargin: '4',
  ISpread: '5',
  Oas: '6',
  GSpread: '7',
  CdsBasis: '8',
  CdsInterpolatedBasis: '9',
  Dv01: '10',
  Pv01: '11',
  Cs01: '12',
} as const);

/** `ReleaseInstruction` values (`FIX::ReleaseInstruction_*`). */
export const ReleaseInstruction = /* @__PURE__ */ Object.freeze({
  Iso: '1',
  NoAwayMarketBetterCheck: '2',
} as const);

/** `RemunerationIndicator` values (`FIX::RemunerationIndicator_*`). */
export const RemunerationIndicator = /* @__PURE__ */ Object.freeze({
  NoRemunerationPaid: '0',
  RemunerationPaid: '1',
} as const);

/** `ReportToExch` values (`FIX::ReportToExch_*`). */
export const ReportToExch = /* @__PURE__ */ Object.freeze({
  No: 'N',
  Yes: 'Y',
} as const);

/** `RequestResult` values (`FIX::RequestResult_*`). */
export const RequestResult = /* @__PURE__ */ Object.freeze({
  ValidRequest: '0',
  InvalidOrUnsupportedRequest: '1',
  NoDataFound: '2',
  NotAuthorized: '3',
  DataTemporarilyUnavailable: '4',
  RequestForDataNotSupported: '5',
  Other: '99',
} as const);

/** `ResetSeqNumFlag` values (`FIX::ResetSeqNumFlag_*`). */
export const ResetSeqNumFlag = /* @__PURE__ */ Object.freeze({
  No: 'N',
  Yes: 'Y',
} as const);

/** `RespondentType` values (`FIX::RespondentType_*`). */
export const RespondentType = /* @__PURE__ */ Object.freeze({
  AllMarketParticipants: '1',
  SpecifiedMarketParticipants: '2',
  AllMarketMakers: '3',
  PrimaryMarketMaker: '4',
} as const);

/** `ResponseTransportType` values (`FIX::ResponseTransportType_*`). */
export const ResponseTransportType = /* @__PURE__ */ Object.freeze({
  Inband: '0',
  OutOfBand: '1',
} as const);

/** `RestructuringType` values (`FIX::RestructuringType_*`). */
export const RestructuringType = /* @__PURE__ */ Object.freeze({
  FullRestructuring: 'FR',
  ModifiedRestructuring: 'MR',
  ModifiedModRestructuring: 'MM',
  NoRestructuringSpecified: 'XR',
} as const);

/** `ReturnRateDateMode` values (`FIX::ReturnRateDateMode_*`). */
export const ReturnRateDateMode = /* @__PURE__ */ Object.freeze({
  PriceValuation: '0',
  DividendValuation: '1',
} as const);

/** `ReturnRatePriceBasis` values (`FIX::ReturnRatePriceBasis_*`). */
export const ReturnRatePriceBasis = /* @__PURE__ */ Object.freeze({
  Gross: '0',
  Net: '1',
  Accrued: '2',
  CleanNet: '3',
} as const);

/** `ReturnRatePriceSequence` values (`FIX::ReturnRatePriceSequence_*`). */
export const ReturnRatePriceSequence = /* @__PURE__ */ Object.freeze({
  Initial: '0',
  Interim: '1',
  Final: '2',
} as const);

/** `ReturnRatePriceType` values (`FIX::ReturnRatePriceType_*`). */
export const ReturnRatePriceType = /* @__PURE__ */ Object.freeze({
  AbsoluteTerms: '0',
  PercentageOfNotional: '1',
} as const);

/** `ReturnRateQuoteTimeType` values (`FIX::ReturnRateQuoteTimeType_*`). */
export const ReturnRateQuoteTimeType = /* @__PURE__ */ Object.freeze({
  Open: '0',
  OfficialSettlPx: '1',
  Xetra: '2',
  Close: '3',
  DerivativesClose: '4',
  High: '5',
  Low: '6',
  AsSpecifiedInMasterConfirmation: '7',
} as const);

/** `ReturnRateValuationPriceOption` values (`FIX::ReturnRateValuationPriceOption_*`). */
export const ReturnRateValuationPriceOption = /* @__PURE__ */ Object.freeze({
  None: '0',
  FuturesPrice: '1',
  OptionsPrice: '2',
} as const);

/** `ReturnTrigger` values (`FIX::ReturnTrigger_*`). */
export const ReturnTrigger = /* @__PURE__ */ Object.freeze({
  Dividend: '1',
  Variance: '2',
  Volatility: '3',
  TotalReturn: '4',
  ContractForDifference: '5',
  CreditDefault: '6',
  SpreadBet: '7',
  Price: '8',
  ForwardPriceUnderlyingInstrument: '9',
  Other: '99',
} as const);

/** `RiskLimitAction` values (`FIX::RiskLimitAction_*`). */
export const RiskLimitAction = /* @__PURE__ */ Object.freeze({
  QueueInbound: '0',
  QueueOutbound: '1',
  Reject: '2',
  Disconnect: '3',
  Warning: '4',
  PingCreditCheckWithRevalidation: '5',
  PingCreditCheckNoRevalidation: '6',
  PushCreditCheckWithRevalidation: '7',
  PushCreditCheckNoRevalidation: '8',
  Suspend: '9',
  HaltTrading: '10',
} as const);

/** `RiskLimitCheckModelType` values (`FIX::RiskLimitCheckModelType_*`). */
export const RiskLimitCheckModelType = /* @__PURE__ */ Object.freeze({
  None: '0',
  PlusOneModel: '1',
  PingModel: '2',
  PushModel: '3',
} as const);

/** `RiskLimitCheckRequestResult` values (`FIX::RiskLimitCheckRequestResult_*`). */
export const RiskLimitCheckRequestResult = /* @__PURE__ */ Object.freeze({
  Successful: '0',
  InvalidParty: '1',
  ReqExceedsCreditLimit: '2',
  ReqExceedsClipSizeLimit: '3',
  ReqExceedsMaxNotional: '4',
  Other: '99',
} as const);

/** `RiskLimitCheckRequestStatus` values (`FIX::RiskLimitCheckRequestStatus_*`). */
export const RiskLimitCheckRequestStatus = /* @__PURE__ */ Object.freeze({
  Approved: '0',
  PartiallyApproved: '1',
  Rejected: '2',
  ApprovalPending: '3',
  Cancelled: '4',
} as const);

/** `RiskLimitCheckRequestType` values (`FIX::RiskLimitCheckRequestType_*`). */
export const RiskLimitCheckRequestType = /* @__PURE__ */ Object.freeze({
  AllOrNone: '0',
  Partial: '1',
} as const);

/** `RiskLimitCheckStatus` values (`FIX::RiskLimitCheckStatus_*`). */
export const RiskLimitCheckStatus = /* @__PURE__ */ Object.freeze({
  Accepted: '0',
  Rejected: '1',
  ClaimRequired: '2',
  PreDefinedLimitCheckSucceeded: '3',
  PreDefinedLimitCheckFailed: '4',
  PreDefinedAutoAcceptRuleInvoked: '5',
  PreDefinedAutoRejectRuleInvoked: '6',
  AcceptedByClearingFirm: '7',
  RejectedByClearingFirm: '8',
  Pending: '9',
  AcceptedByCreditHub: '10',
  RejectedByCreditHub: '11',
  PendingCreditHubCheck: '12',
  AcceptedByExecVenue: '13',
  RejectedByExecVenue: '14',
} as const);

/** `RiskLimitCheckTransType` values (`FIX::RiskLimitCheckTransType_*`). */
export const RiskLimitCheckTransType = /* @__PURE__ */ Object.freeze({
  New: '0',
  Cancel: '1',
  Replace: '2',
} as const);

/** `RiskLimitCheckType` values (`FIX::RiskLimitCheckType_*`). */
export const RiskLimitCheckType = /* @__PURE__ */ Object.freeze({
  Submit: '0',
  LimitConsumed: '1',
} as const);

/** `RiskLimitReportRejectReason` values (`FIX::RiskLimitReportRejectReason_*`). */
export const RiskLimitReportRejectReason = /* @__PURE__ */ Object.freeze({
  UnkRiskLmtRprtId: '0',
  UnkPty: '1',
  Other: '99',
} as const);

/** `RiskLimitReportStatus` values (`FIX::RiskLimitReportStatus_*`). */
export const RiskLimitReportStatus = /* @__PURE__ */ Object.freeze({
  Accepted: '0',
  Rejected: '1',
} as const);

/** `RiskLimitRequestResult` values (`FIX::RiskLimitRequestResult_*`). */
export const RiskLimitRequestResult = /* @__PURE__ */ Object.freeze({
  Successful: '0',
  InvalidParty: '1',
  InvalidRelatedParty: '2',
  InvalidRiskLimitType: '3',
  InvalidRiskLimitId: '4',
  InvalidRiskLimitAmount: '5',
  InvalidRiskWarningLevelAction: '6',
  InvalidRiskInstrumentScope: '7',
  RiskLimitActionsNotSupported: '8',
  WarningLevelsNotSupported: '9',
  WarningLevelActionsNotSupported: '10',
  RiskInstrumentScopeNotSupported: '11',
  RiskLimitNotApprovedForParty: '12',
  RiskLimitAlreadyDefinedForParty: '13',
  InstrumentNotApprovedForParty: '14',
  NotAuthorized: '98',
  Other: '99',
} as const);

/** `RiskLimitRequestType` values (`FIX::RiskLimitRequestType_*`). */
export const RiskLimitRequestType = /* @__PURE__ */ Object.freeze({
  Definitions: '1',
  Utilization: '2',
  DefinitionsAndUtilizations: '3',
} as const);

/** `RiskLimitType` values (`FIX::RiskLimitType_*`). */
export const RiskLimitType = /* @__PURE__ */ Object.freeze({
  CreditLimit: '0',
  GrossLimit: '1',
  NetLimit: '2',
  Exposure: '3',
  LongLimit: '4',
  ShortLimit: '5',
  CashMargin: '6',
  AdditionalMargin: '7',
  TotalMargin: '8',
  LimitConsumed: '9',
  ClipSize: '10',
  MaxNotionalOrderSize: '11',
  Dv01Pv01Limit: '12',
  Cs01Limit: '13',
  VolumeLimitPerTimePeriod: '14',
  VolFilledPctOrdVolTmPeriod: '15',
  NotlFilledPctNotlTmPeriod: '16',
  TransactionExecutionLimitPerTimePeriod: '17',
} as const);

/** `RoundingDirection` values (`FIX::RoundingDirection_*`). */
export const RoundingDirection = /* @__PURE__ */ Object.freeze({
  RoundToNearest: '0',
  RoundDown: '1',
  RoundUp: '2',
} as const);

/** `RoutingArrangmentIndicator` values (`FIX::RoutingArrangmentIndicator_*`). */
export const RoutingArrangmentIndicator = /* @__PURE__ */ Object.freeze({
  NoRoutingArrangmentInPlace: '0',
  RoutingArrangementInPlace: '1',
} as const);

/** `RoutingType` values (`FIX::RoutingType_*`). */
export const RoutingType = /* @__PURE__ */ Object.freeze({
  TargetFirm: '1',
  TargetList: '2',
  BlockFirm: '3',
  BlockList: '4',
  TargetPerson: '5',
  BlockPerson: '6',
} as const);

/** `Rule80A` values (`FIX::Rule80A_*`). */
export const Rule80A = /* @__PURE__ */ Object.freeze({
  AgencySingleOrder: 'A',
  ProprietaryNonAlgo: 'C',
  ProgramOrderMember: 'D',
  IndividualInvestor: 'I',
  ProprietaryAlgo: 'J',
  AgencyAlgo: 'K',
  ProgramOrderOtherMember: 'M',
  AgentForOtherMember: 'N',
  AgencyIndexArb: 'U',
  AllOtherOrdersAsAgentForOtherMember: 'W',
  AgencyNonAlgo: 'Y',
  ShortExemptTransactionAType: 'B',
  ShortExemptTransactionForPrincipal: 'E',
  ShortExemptTransactionWType: 'F',
  ShortExemptTransactionIType: 'H',
  ShortExemptTransactionMemberAffliated: 'L',
  ProprietaryTransactionAffiliated: 'O',
  Principal: 'P',
  TransactionNonMember: 'R',
  SpecialistTrades: 'S',
  TransactionUnaffiliatedMember: 'T',
  ShortExemptTransactionMemberNotAffliated: 'X',
  ShortExemptTransactionNonMember: 'Z',
} as const);

/** `Scope` values (`FIX::Scope_*`). */
export const Scope = /* @__PURE__ */ Object.freeze({
  LocalMarket: '1',
  National: '2',
  Global: '3',
} as const);

/** `SecurityClassificationReason` values (`FIX::SecurityClassificationReason_*`). */
export const SecurityClassificationReason = /* @__PURE__ */ Object.freeze({
  Fee: '0',
  CreditControls: '1',
  Margin: '2',
  EntitlementOrEligibility: '3',
  MarketData: '4',
  AccountSelection: '5',
  DeliveryProcess: '6',
  Sector: '7',
} as const);

/** `SecurityIDSource` values (`FIX::SecurityIDSource_*`). */
export const SecurityIDSource = /* @__PURE__ */ Object.freeze({
  Sicovam: 'E',
  Sedol: '2',
  Cusip: '1',
  Quik: '3',
  Belgian: 'F',
  Valoren: 'D',
  Dutch: 'C',
  Wertpapier: 'B',
  BloombergSymbol: 'A',
  ConsolidatedTapeAssociation: '9',
  ExchangeSymbol: '8',
  IsoCountryCode: '7',
  IsoCurrencyCode: '6',
  RicCode: '5',
  IsinNumber: '4',
  Common: 'G',
  ClearingHouse: 'H',
  IsdaFpMlSpecification: 'I',
  OptionPriceReportingAuthority: 'J',
  IsdaFpMlurl: 'K',
  LetterOfCredit: 'L',
  MarketplaceAssignedIdentifier: 'M',
  MarkitRedEntityClip: 'N',
  MarkitRedPairClip: 'P',
  CftcCommodityCode: 'Q',
  IsdaCommodityReferencePrice: 'R',
  FinancialInstrumentGlobalIdentifier: 'S',
  LegalEntityIdentifier: 'T',
  Synthetic: 'U',
  FidessaInstrumentMnemonic: 'V',
  IndexName: 'W',
  UniformSymbol: 'X',
  DigitalTokenIdentifier: 'Y',
} as const);

/** `SecurityListRequestType` values (`FIX::SecurityListRequestType_*`). */
export const SecurityListRequestType = /* @__PURE__ */ Object.freeze({
  SecurityTypeAnd: '1',
  Product: '2',
  TradingSessionId: '3',
  AllSecurities: '4',
  Symbol: '0',
  MarketIdOrMarketId: '5',
} as const);

/** `SecurityListType` values (`FIX::SecurityListType_*`). */
export const SecurityListType = /* @__PURE__ */ Object.freeze({
  IndustryClassification: '1',
  TradingList: '2',
  Market: '3',
  NewspaperList: '4',
} as const);

/** `SecurityListTypeSource` values (`FIX::SecurityListTypeSource_*`). */
export const SecurityListTypeSource = /* @__PURE__ */ Object.freeze({
  Icb: '1',
  Naics: '2',
  Gics: '3',
} as const);

/** `SecurityRejectReason` values (`FIX::SecurityRejectReason_*`). */
export const SecurityRejectReason = /* @__PURE__ */ Object.freeze({
  InvalidInstrumentRequested: '1',
  InstrumentAlreadyExists: '2',
  RequestTypeNotSupported: '3',
  SystemUnavailableForInstrumentCreation: '4',
  IneligibleInstrumentGroup: '5',
  InstrumentIdUnavailable: '6',
  InvalidOrMissingDataOnOptionLeg: '7',
  InvalidOrMissingDataOnFutureLeg: '8',
  InvalidOrMissingDataOnFxLeg: '10',
  InvalidLegPriceSpecified: '11',
  InvalidInstrumentStructureSpecified: '12',
} as const);

/** `SecurityRequestResult` values (`FIX::SecurityRequestResult_*`). */
export const SecurityRequestResult = /* @__PURE__ */ Object.freeze({
  InstrumentDataTemporarilyUnavailable: '4',
  ValidRequest: '0',
  InvalidOrUnsupportedRequest: '1',
  RequestForInstrumentDataNotSupported: '5',
  NotAuthorizedToRetrieveInstrumentData: '3',
  NoInstrumentsFound: '2',
} as const);

/** `SecurityRequestType` values (`FIX::SecurityRequestType_*`). */
export const SecurityRequestType = /* @__PURE__ */ Object.freeze({
  RequestSecurityIdentityAndSpecifications: '0',
  RequestSecurityIdentityForSpecifications: '1',
  RequestListSecurityTypes: '2',
  RequestListSecurities: '3',
  Symbol: '4',
  SecurityTypeAndOrCfiCode: '5',
  Product: '6',
  TradingSessionId: '7',
  AllSecurities: '8',
  MarketIdOrMarketId: '9',
} as const);

/** `SecurityResponseType` values (`FIX::SecurityResponseType_*`). */
export const SecurityResponseType = /* @__PURE__ */ Object.freeze({
  AcceptAsIs: '1',
  AcceptWithRevisions: '2',
  ListOfSecurityTypesReturnedPerRequest: '3',
  ListOfSecuritiesReturnedPerRequest: '4',
  RejectSecurityProposal: '5',
  CannotMatchSelectionCriteria: '6',
} as const);

/** `SecurityStatus` values (`FIX::SecurityStatus_*`). */
export const SecurityStatus = /* @__PURE__ */ Object.freeze({
  Active: '1',
  Inactive: '2',
  ActiveClosingOrdersOnly: '3',
  Expired: '4',
  Delisted: '5',
  KnockedOut: '6',
  KnockOutRevoked: '7',
  PendingExpiry: '8',
  Suspended: '9',
  Published: '10',
  PendingDeletion: '11',
} as const);

/** `SecurityTradingEvent` values (`FIX::SecurityTradingEvent_*`). */
export const SecurityTradingEvent = /* @__PURE__ */ Object.freeze({
  OrderImbalance: '1',
  TradingResumes: '2',
  PriceVolatilityInterruption: '3',
  ChangeOfTradingSession: '4',
  ChangeOfTradingSubsession: '5',
  ChangeOfSecurityTradingStatus: '6',
  ChangeOfBookType: '7',
  ChangeOfMarketDepth: '8',
  CorporateAction: '9',
} as const);

/** `SecurityTradingStatus` values (`FIX::SecurityTradingStatus_*`). */
export const SecurityTradingStatus = /* @__PURE__ */ Object.freeze({
  OpeningDelay: '1',
  MarketOnCloseImbalanceSell: '10',
  NoMarketImbalance: '12',
  NoMarketOnCloseImbalance: '13',
  ItsPreOpening: '14',
  NewPriceIndication: '15',
  TradeDisseminationTime: '16',
  ReadyToTrade: '17',
  NotAvailableForTrading: '18',
  NotTradedOnThisMarket: '19',
  TradingHalt: '2',
  UnknownOrInvalid: '20',
  Resume: '3',
  NoOpen: '4',
  PriceIndication: '5',
  TradingRangeIndication: '6',
  MarketImbalanceBuy: '7',
  MarketImbalanceSell: '8',
  MarketOnCloseImbalanceBuy: '9',
  OpeningRotation: '22',
  PreOpen: '21',
  FastMarket: '23',
  PreCross: '24',
  Cross: '25',
  PostClose: '26',
  NoCancel: '27',
} as const);

/** `SecurityType` values (`FIX::SecurityType_*`). */
export const SecurityType = /* @__PURE__ */ Object.freeze({
  BankersAcceptance: 'BA',
  CertificateOfDeposit: 'CD',
  CollateralizedMortgageObligation: 'CMO',
  CorporateBond: 'CORP',
  CommercialPaper: 'CP',
  CorporatePrivatePlacement: 'CPP',
  CommonStock: 'CS',
  FederalHousingAuthority: 'FHA',
  FederalHomeLoan: 'FHL',
  FederalNationalMortgageAssociation: 'FN',
  ForeignExchangeContract: 'FOR',
  Future: 'FUT',
  GovernmentNationalMortgageAssociation: 'GN',
  TreasuriesAgencyDebenture: 'GOVT',
  MutualFund: 'MF',
  MortgageInterestOnly: 'MIO',
  MortgagePrincipalOnly: 'MPO',
  MortgagePrivatePlacement: 'MPP',
  MiscellaneousPassThrough: 'MPT',
  MunicipalBond: 'MUNI',
  NoSecurityType: 'NONE',
  Option: 'OPT',
  PreferredStock: 'PS',
  RepurchaseAgreement: 'RP',
  ReverseRepurchaseAgreement: 'RVRP',
  StudentLoanMarketingAssociation: 'SL',
  TimeDeposit: 'TD',
  UsTreasuryBillOld: 'USTB',
  Warrant: 'WAR',
  CatsTigersAndLions: 'ZOO',
  Wildcard: '?',
  ConvertibleBond: 'CB',
  IoetteMortgage: 'IET',
  VariableRateDemandNote: 'VRDN',
  PlazosFijos: 'PZFJ',
  PromissoryNote: 'PN',
  Overnight: 'ONITE',
  MediumTermNotes: 'MTN',
  TaxExemptCommercialPaper: 'TECP',
  Amended: 'AMENDED',
  BridgeLoan: 'BRIDGE',
  LetterOfCredit: 'LOFC',
  SwingLineFacility: 'SWING',
  DebtorInPossession: 'DINP',
  Defaulted: 'DEFLTED',
  Withdrawn: 'WITHDRN',
  LiquidityNote: 'LQN',
  Matured: 'MATURED',
  DepositNotes: 'DN',
  Retired: 'RETIRED',
  BankNotes: 'BN',
  BillOfExchanges: 'BOX',
  CallLoans: 'CL',
  Replaced: 'REPLACD',
  MandatoryTender: 'MT',
  Revolver: 'RVLVTRM',
  ShortTermLoanNote: 'STN',
  ToBeAnnounced: 'TBA',
  OtherAnticipationNotes: 'AN',
  CertificateOfParticipation: 'COFP',
  MortgageBackedSecurities: 'MBS',
  RevenueBonds: 'REV',
  SpecialAssessment: 'SPCLA',
  SpecialObligation: 'SPCLO',
  SpecialTax: 'SPCLT',
  TaxAnticipationNote: 'TAN',
  TaxAllocation: 'TAXA',
  CertificateOfObligation: 'COFO',
  GeneralObligationBonds: 'GO',
  MultilegInstrument: 'MLEG',
  TaxRevenueAnticipationNote: 'TRAN',
  ExtendedCommNote: 'XCN',
  AgencyPools: 'POOL',
  AssetBackedSecurities: 'ABS',
  Corp: 'CMBS',
  RevenueAnticipationNote: 'RAN',
  RevolverLoan: 'RVLV',
  FederalAgencyCoupon: 'FAC',
  FederalAgencyDiscountNote: 'FADN',
  PrivateExportFunding: 'PEF',
  DualCurrency: 'DUAL',
  IndexedLinked: 'XLINKD',
  YankeeCorporateBond: 'YANK',
  BradyBond: 'BRADY',
  UsTreasuryBond: 'TBOND',
  InterestStripFromAnyBondOrNote: 'TINT',
  TreasuryInflationProtectedSecurities: 'TIPS',
  PrincipalStripOfACallableBondOrNote: 'TCAL',
  PrincipalStripFromANonCallableBondOrNote: 'TPRN',
  UsTreasuryNoteOld: 'UST',
  TermLoan: 'TERM',
  StructuredNotes: 'STRUCT',
  EuroSupranationalCoupons: 'EUSUPRA',
  UsdSupranationalCoupons: 'SUPRA',
  EuroCorporateBond: 'EUCORP',
  EuroSovereigns: 'EUSOV',
  UsTreasuryNote: 'TNOTE',
  UsTreasuryBill: 'TBILL',
  Repurchase: 'REPO',
  Forward: 'FORWARD',
  BuySellback: 'BUYSELL',
  SecuritiesLoan: 'SECLOAN',
  SecuritiesPledge: 'SECPLEDGE',
  EuroCertificateOfDeposit: 'EUCD',
  EuroCommercialPaper: 'EUCP',
  YankeeCertificateOfDeposit: 'YCD',
  Pfandbriefe: 'PFAND',
  OptionsOnFutures: 'OOF',
  OptionsOnPhysical: 'OOP',
  WildcardEntry: 'WLD',
  Cash: 'CASH',
  EuroCorporateFloatingRateNotes: 'EUFRN',
  UsCorporateFloatingRateNotes: 'FRN',
  CreditDefaultSwap: 'CDS',
  InterestRateSwap: 'IRS',
  OptionsOnCombo: 'OOC',
  CanadianTreasuryNotes: 'CAN',
  CanadianTreasuryBills: 'CTB',
  CanadianProvincialBonds: 'PROV',
  TreasuryBill: 'TB',
  BankDepositoryNote: 'BDN',
  CanadianMoneyMarkets: 'CAMM',
  SecuredLiquidityNote: 'SLQN',
  TermLiquidityNote: 'TLQN',
  CanadianMortgageBonds: 'CMB',
  TaxableMunicipalCp: 'TMCP',
  OffshoreIssuedChineseYuanCorporateBond: 'DIMSUMCORP',
  PreferredCorporateBond: 'PRCORP',
  NonDeliverableForward: 'FXNDF',
  FxSpot: 'FXSPOT',
  FxForward: 'FXFWD',
  FxSwap: 'FXSWAP',
  NonDeliverableSwap: 'FXNDS',
  FxBankNote: 'FXBN',
  ForeignCurrencyDiscountNote: 'FXDN',
  Cap: 'CAP',
  Collar: 'CLLR',
  CommoditySwap: 'CMDTYSWAP',
  Exotic: 'EXOTIC',
  Floor: 'FLR',
  Fra: 'FRA',
  DerivativeForward: 'FWD',
  TotalReturnSwap: 'TRS',
  LoanLease: 'LOANLEASE',
  SpotForward: 'SPOTFWD',
  SwapOption: 'SWAPTION',
  Transmission: 'XMISSION',
  Index: 'INDEX',
  BondBasket: 'BDBSKT',
  ContractForDifference: 'CFD',
  CorrelationSwap: 'CRLTNSWAP',
  DiviendSwap: 'DVDNDSWAP',
  EquityBasket: 'EQBSKT',
  EquityForward: 'EQFWD',
  ReturnSwap: 'RTRNSWAP',
  VarianceSwap: 'VARSWAP',
  PortfolioSwaps: 'PRTFLIOSWAP',
  FuturesOnASwap: 'FUTSWAP',
  ForwardsOnASwap: 'FWDSWAP',
  ForwardFreightAgreement: 'FWDFRTAGMT',
  SpreadBetting: 'SPREADBET',
  ExchangeTradedCommodity: 'ETC',
  DepositoryReceipts: 'DR',
  DeliveryVersusPledge: 'DVPLDG',
  CollateralBasket: 'COLLBSKT',
  StructuredFinanceProduct: 'SFP',
  MarginLoan: 'MRGNLOAN',
  OffshoreIssuedChineseYuanSovereignBond: 'DIMSUMSOV',
  SovereignBond: 'SOV',
  UsTreasuryFloatingRateNote: 'TFRN',
  BankAcceptedBill: 'BAB',
  ShortTermBankNote: 'BNST',
  CallableCommercialPaper: 'CLCP',
  CommercialNote: 'CN',
  InterestBearingCommercialPaper: 'CPIB',
  EuroMediumTermNote: 'EUMTN',
  EuroNegotiableCommercialPaper: 'EUNCP',
  EuroStructuredLiquidityNote: 'EUSTLQN',
  EuroTimeDeposit: 'EUTD',
  JumboCertificateOfDeposit: 'JCD',
  MoneyMarketFund: 'MMF',
  MasterNote: 'MN',
  NegotiableCertificateOfDeposit: 'NCD',
  NegotiableCommercialPaper: 'NCP',
  RetailCertificateOfDeposit: 'RCD',
  TermDepositReceipt: 'TDR',
  Pfandbrief: 'PFAND',
  MunicipalInterestBearingCommercialPaper: 'MCPIB',
  TaxableMunicipalBond: 'TMB',
  VariableRateDemandObligation: 'VRDO',
  Other: 'Other',
  ExchangeTradedNote: 'ETN',
  SecuritizedDerivative: 'SECDERIV',
  ExchangeTradedFund: 'ETF',
  DigitalAsset: 'DIGITAL',
} as const);

/** `SecurityUpdateAction` values (`FIX::SecurityUpdateAction_*`). */
export const SecurityUpdateAction = /* @__PURE__ */ Object.freeze({
  Add: 'A',
  Delete: 'D',
  Modify: 'M',
} as const);

/** `SelfMatchPreventionInstruction` values (`FIX::SelfMatchPreventionInstruction_*`). */
export const SelfMatchPreventionInstruction = /* @__PURE__ */ Object.freeze({
  CancelAggressive: '1',
  CancelPassive: '2',
  CancelAggressivePassive: '3',
} as const);

/** `Seniority` values (`FIX::Seniority_*`). */
export const Seniority = /* @__PURE__ */ Object.freeze({
  SeniorSecured: 'SD',
  Senior: 'SR',
  Subordinated: 'SB',
  Junior: 'JR',
  Mezzanine: 'MZ',
  SeniorNonPreferred: 'SN',
} as const);

/** `SessionRejectReason` values (`FIX::SessionRejectReason_*`). */
export const SessionRejectReason = /* @__PURE__ */ Object.freeze({
  InvalidTagNumber: '0',
  RequiredTagMissing: '1',
  TagNotDefinedForThisMessageType: '2',
  UndefinedTag: '3',
  TagSpecifiedWithoutAValue: '4',
  ValueIsIncorrect: '5',
  IncorrectDataFormatForValue: '6',
  DecryptionProblem: '7',
  SignatureProblem: '8',
  CompidProblem: '9',
  SendingtimeAccuracyProblem: '10',
  InvalidMsgtype: '11',
  XmlValidationError: '12',
  TagAppearsMoreThanOnce: '13',
  TagSpecifiedOutOfRequiredOrder: '14',
  RepeatingGroupFieldsOutOfOrder: '15',
  IncorrectNumingroupCountForRepeatingGroup: '16',
  NonDataValueIncludesFieldDelimiter: '17',
  InvalidUnsupportedApplicationVersion: '18',
  Other: '99',
  SendingTimeAccuracyProblem: '10',
  InvalidMsgType: '11',
  CompIdProblem: '9',
  Non: '17',
  IncorrectNumInGroupCountForRepeatingGroup: '16',
} as const);

/** `SessionStatus` values (`FIX::SessionStatus_*`). */
export const SessionStatus = /* @__PURE__ */ Object.freeze({
  SessionActive: '0',
  SessionPasswordChanged: '1',
  SessionPasswordDueToExpire: '2',
  NewSessionPasswordDoesNotComplyWithPolicy: '3',
  SessionLogoutComplete: '4',
  InvalidUsernameOrPassword: '5',
  AccountLocked: '6',
  LogonsAreNotAllowedAtThisTime: '7',
  PasswordExpired: '8',
} as const);

/** `SettlCurrFxRateCalc` values (`FIX::SettlCurrFxRateCalc_*`). */
export const SettlCurrFxRateCalc = /* @__PURE__ */ Object.freeze({
  Divide: 'D',
  Multiply: 'M',
} as const);

/** `SettlDeliveryType` values (`FIX::SettlDeliveryType_*`). */
export const SettlDeliveryType = /* @__PURE__ */ Object.freeze({
  Free: '1',
  Versus: '0',
  TriParty: '2',
  HoldInCustody: '3',
} as const);

/** `SettlDisruptionProvision` values (`FIX::SettlDisruptionProvision_*`). */
export const SettlDisruptionProvision = /* @__PURE__ */ Object.freeze({
  Negotiation: '1',
  Cancellation: '2',
} as const);

/** `SettlInstMode` values (`FIX::SettlInstMode_*`). */
export const SettlInstMode = /* @__PURE__ */ Object.freeze({
  Default: '0',
  StandingInstructionsProvided: '1',
  SpecificAllocationAccountOverriding: '2',
  SpecificAllocationAccountStanding: '3',
  SpecificOrderForASingleAccount: '4',
  RequestReject: '5',
} as const);

/** `SettlInstReqRejCode` values (`FIX::SettlInstReqRejCode_*`). */
export const SettlInstReqRejCode = /* @__PURE__ */ Object.freeze({
  UnableToProcessRequest: '0',
  UnknownAccount: '1',
  NoMatchingSettlementInstructionsFound: '2',
  Other: '99',
} as const);

/** `SettlInstSource` values (`FIX::SettlInstSource_*`). */
export const SettlInstSource = /* @__PURE__ */ Object.freeze({
  BrokerCredit: '1',
  Institution: '2',
  Investor: '3',
} as const);

/** `SettlInstTransType` values (`FIX::SettlInstTransType_*`). */
export const SettlInstTransType = /* @__PURE__ */ Object.freeze({
  Cancel: 'C',
  New: 'N',
  Replace: 'R',
  Restate: 'T',
} as const);

/** `SettlLocation` values (`FIX::SettlLocation_*`). */
export const SettlLocation = /* @__PURE__ */ Object.freeze({
  Cedel: 'CED',
  DepositoryTrustCompany: 'DTC',
  EuroClear: 'EUR',
  FederalBookEntry: 'FED',
  LocalMarketSettleLocation: 'ISO Country Code',
  Physical: 'PNY',
  ParticipantTrustCompany: 'PTC',
} as const);

/** `SettlMethod` values (`FIX::SettlMethod_*`). */
export const SettlMethod = /* @__PURE__ */ Object.freeze({
  CashSettlementRequired: 'C',
  PhysicalSettlementRequired: 'P',
  Election: 'E',
} as const);

/** `SettlObligMode` values (`FIX::SettlObligMode_*`). */
export const SettlObligMode = /* @__PURE__ */ Object.freeze({
  Preliminary: '1',
  Final: '2',
} as const);

/** `SettlObligSource` values (`FIX::SettlObligSource_*`). */
export const SettlObligSource = /* @__PURE__ */ Object.freeze({
  InstructionsOfBroker: '1',
  InstructionsForInstitution: '2',
  Investor: '3',
  BuyersSettlementInstructions: '4',
  SellersSettlementInstructions: '5',
} as const);

/** `SettlObligTransType` values (`FIX::SettlObligTransType_*`). */
export const SettlObligTransType = /* @__PURE__ */ Object.freeze({
  Cancel: 'C',
  New: 'N',
  Replace: 'R',
  Restate: 'T',
} as const);

/** `SettlPriceType` values (`FIX::SettlPriceType_*`). */
export const SettlPriceType = /* @__PURE__ */ Object.freeze({
  Final: '1',
  Theoretical: '2',
} as const);

/** `SettlSessID` values (`FIX::SettlSessID_*`). */
export const SettlSessID = /* @__PURE__ */ Object.freeze({
  Intraday: 'ITD',
  RegularTradingHours: 'RTH',
  ElectronicTradingHours: 'ETH',
  EndOfDay: 'EOD',
} as const);

/** `SettlSubMethod` values (`FIX::SettlSubMethod_*`). */
export const SettlSubMethod = /* @__PURE__ */ Object.freeze({
  Shares: '1',
  Derivatives: '2',
  PaymentVsPayment: '3',
  Notional: '4',
  Cascade: '5',
  Repurchase: '6',
  Other: '99',
} as const);

/** `SettlType` values (`FIX::SettlType_*`). */
export const SettlType = /* @__PURE__ */ Object.freeze({
  Regular: '0',
  Cash: '1',
  NextDay: '2',
  TPlus2: '3',
  TPlus3: '4',
  TPlus4: '5',
  Future: '6',
  WhenAndIfIssued: '7',
  SellersOption: '8',
  TPlus5: '9',
  BrokenDate: 'B',
  FxSpotNextSettlement: 'C',
} as const);

/** `SettlmntTyp` values (`FIX::SettlmntTyp_*`). */
export const SettlmntTyp = /* @__PURE__ */ Object.freeze({
  Regular: '0',
  Cash: '1',
  NextDay: '2',
  TPlus2: '3',
  TPlus3: '4',
  TPlus4: '5',
  Future: '6',
  WhenAndIfIssued: '7',
  SellersOption: '8',
  TPlus5: '9',
  T1: 'A',
} as const);

/** `ShortSaleExemptionReason` values (`FIX::ShortSaleExemptionReason_*`). */
export const ShortSaleExemptionReason = /* @__PURE__ */ Object.freeze({
  ExemptionReasonUnknown: '0',
  IncomingSse: '1',
  AboveNationalBestBid: '2',
  DelayedDelivery: '3',
  OddLot: '4',
  DomesticArbitrage: '5',
  InternationalArbitrage: '6',
  UnderwriterOrSyndicateDistribution: '7',
  RisklessPrincipal: '8',
  Vwap: '9',
} as const);

/** `ShortSaleReason` values (`FIX::ShortSaleReason_*`). */
export const ShortSaleReason = /* @__PURE__ */ Object.freeze({
  DealerSoldShort: '0',
  DealerSoldShortExempt: '1',
  SellingCustomerSoldShort: '2',
  SellingCustomerSoldShortExempt: '3',
  QualifiedServiceRepresentative: '4',
  QsrOrAguContraSideSoldShortExempt: '5',
} as const);

/** `ShortSaleRestriction` values (`FIX::ShortSaleRestriction_*`). */
export const ShortSaleRestriction = /* @__PURE__ */ Object.freeze({
  NoRestrictions: '0',
  SecurityNotShortable: '1',
  SecurityNotShortableAtOrBelowBestBid: '2',
  SecurityNotShortableWithoutPreBorrow: '3',
} as const);

/** `Side` values (`FIX::Side_*`). */
export const Side = /* @__PURE__ */ Object.freeze({
  Buy: '1',
  Sell: '2',
  BuyMinus: '3',
  SellPlus: '4',
  SellShort: '5',
  SellShortExempt: '6',
  Undisclosed: '7',
  Cross: '8',
  CrossShort: '9',
  AsDefined: 'B',
  Opposite: 'C',
  CrossShortExempt: 'A',
  Subscribe: 'D',
  Redeem: 'E',
  Lend: 'F',
  Borrow: 'G',
  SellUndisclosed: 'H',
} as const);

/** `SideAvgPxIndicator` values (`FIX::SideAvgPxIndicator_*`). */
export const SideAvgPxIndicator = /* @__PURE__ */ Object.freeze({
  NoAvgPricing: '0',
  TradeIsPartAvgPriceGrp: '1',
  LastTradeIsPartAvgPriceGrp: '2',
} as const);

/** `SideClearingTradePriceType` values (`FIX::SideClearingTradePriceType_*`). */
export const SideClearingTradePriceType = /* @__PURE__ */ Object.freeze({
  TradeClearingAtExecutionPrice: '0',
  TradeClearingAtAlternateClearingPrice: '1',
} as const);

/** `SideMultiLegReportingType` values (`FIX::SideMultiLegReportingType_*`). */
export const SideMultiLegReportingType = /* @__PURE__ */ Object.freeze({
  SingleSecurity: '1',
  IndividualLegOfAMultilegSecurity: '2',
  MultilegSecurity: '3',
} as const);

/** `SideValueInd` values (`FIX::SideValueInd_*`). */
export const SideValueInd = /* @__PURE__ */ Object.freeze({
  SideValue1: '1',
  SideValue2: '2',
} as const);

/** `SingleQuoteIndicator` values (`FIX::SingleQuoteIndicator_*`). */
export const SingleQuoteIndicator = /* @__PURE__ */ Object.freeze({
  No: 'N',
  Yes: 'Y',
} as const);

/** `SolicitedFlag` values (`FIX::SolicitedFlag_*`). */
export const SolicitedFlag = /* @__PURE__ */ Object.freeze({
  No: 'N',
  Yes: 'Y',
} as const);

/** `StandInstDbType` values (`FIX::StandInstDbType_*`). */
export const StandInstDbType = /* @__PURE__ */ Object.freeze({
  Other: '0',
  Dtcsid: '1',
  ThomsonAlert: '2',
  AGlobalCustodian: '3',
  AccountNet: '4',
} as const);

/** `StatsType` values (`FIX::StatsType_*`). */
export const StatsType = /* @__PURE__ */ Object.freeze({
  ExchangeLast: '1',
  High: '2',
  AveragePrice: '3',
  Turnover: '4',
} as const);

/** `StatusValue` values (`FIX::StatusValue_*`). */
export const StatusValue = /* @__PURE__ */ Object.freeze({
  Connected: '1',
  NotConnectedUnexpected: '2',
  NotConnectedExpected: '3',
  InProcess: '4',
} as const);

/** `StipulationType` values (`FIX::StipulationType_*`). */
export const StipulationType = /* @__PURE__ */ Object.freeze({
  AbsolutePrepaymentSpeed: 'ABS',
  WeightedAverageLoanAge: 'WALA',
  WeightedAverageMaturity: 'WAM',
  ConstantPrepaymentRate: 'CPR',
  FinalCprOfHomeEquityPrepaymentCurve: 'HEP',
  WeightedAverageLifeCoupon: 'WAL',
  PercentOfManufacturedHousingPrepaymentCurve: 'MHP',
  SingleMonthlyMortality: 'SMM',
  MonthlyPrepaymentRate: 'MPR',
  PercentOfBmaPrepaymentCurve: 'PSA',
  PercentOfProspectusPrepaymentCurve: 'PPC',
  ConstantPrepaymentPenalty: 'CPP',
  LotVariance: 'LOTVAR',
  ConstantPrepaymentYield: 'CPY',
  WeightedAverageCoupon: 'WAC',
  IssueDate: 'ISSUE',
  MaturityYearAndMonth: 'MAT',
  NumberOfPieces: 'PIECES',
  PoolsMaximum: 'PMAX',
  PoolsPerMillion: 'PPM',
  PoolsPerLot: 'PPL',
  PoolsPerTrade: 'PPT',
  ProductionYear: 'PROD',
  TradeVariance: 'TRDVAR',
  Geographics: 'GEOG',
  AlternativeMinimumTax: 'AMT',
  AutoReinvestment: 'AUTOREINV',
  BankQualified: 'BANKQUAL',
  BargainConditions: 'BGNCON',
  CouponRange: 'COUPON',
  IsoCurrencyCode: 'CURRENCY',
  CustomStart: 'CUSTOMDATE',
  ValuationDiscount: 'HAIRCUT',
  Insured: 'INSURED',
  Issuer: 'ISSUER',
  IssueSizeRange: 'ISSUESIZE',
  LookbackDays: 'LOOKBACK',
  ExplicitLotIdentifier: 'LOT',
  MaturityRange: 'MATURITY',
  MaximumSubstitutions: 'MAXSUBS',
  MinimumQuantity: 'MINQTY',
  MinimumIncrement: 'MININCR',
  MinimumDenomination: 'MINDNOM',
  PaymentFrequency: 'PAYFREQ',
  PriceRange: 'PRICE',
  PricingFrequency: 'PRICEFREQ',
  CallProtection: 'PROTECT',
  Purpose: 'PURPOSE',
  BenchmarkPriceSource: 'PXSOURCE',
  RatingSourceAndRange: 'RATING',
  TypeOfRedemption: 'REDEMPTION',
  Restricted: 'RESTRICTED',
  MarketSector: 'SECTOR',
  SecurityTypeIncludedOrExcluded: 'SECTYPE',
  Structure: 'STRUCT',
  SubstitutionsFrequency: 'SUBSFREQ',
  SubstitutionsLeft: 'SUBSLEFT',
  FreeformText: 'TEXT',
  WholePool: 'WHOLE',
  YieldRange: 'YIELD',
  AverageFicoScore: 'AVFICO',
  AverageLoanSize: 'AVSIZE',
  MaximumLoanBalance: 'MAXBAL',
  PoolIdentifier: 'POOL',
  TypeOfRollTrade: 'ROLLTYPE',
  ReferenceToRollingOrClosingTrade: 'REFTRADE',
  PrincipalOfRollingOrClosingTrade: 'REFPRIN',
  InterestOfRollingOrClosingTrade: 'REFINT',
  AvailableOfferQuantityToBeShownToTheStreet: 'AVAILQTY',
  BrokerCredit: 'BROKERCREDIT',
  OfferPriceToBeShownToInternalBrokers: 'INTERNALPX',
  OfferQuantityToBeShownToInternalBrokers: 'INTERNALQTY',
  TheMinimumResidualOfferQuantity: 'LEAVEQTY',
  MaximumOrderSize: 'MAXORDQTY',
  OrderQuantityIncrement: 'ORDRINCR',
  PrimaryOrSecondaryMarketIndicator: 'PRIMARY',
  BrokerSalesCreditOverride: 'SALESCREDITOVR',
  TraderCredit: 'TRADERCREDIT',
  DiscountRate: 'DISCOUNT',
  YieldToMaturity: 'YTM',
  OriginalAmount: 'ORIGAMT',
  PoolEffectiveDate: 'POOLEFFDT',
  PoolInitialFactor: 'POOLINITFCTR',
  Tranche: 'TRANCHE',
  Substitution: 'SUBSTITUTION',
  Multexchfllbck: 'MULTEXCHFLLBCK',
  Compsecfllbck: 'COMPSECFLLBCK',
  Locljrsdctn: 'LOCLJRSDCTN',
  Relvjrsdctn: 'RELVJRSDCTN',
  IncurredRecovery: 'INCURRCVY',
  AdditionalTerm: 'ADDTRM',
  ModifiedEquityDelivery: 'MODEQTYDLVY',
  NoReferenceOblication: 'NOREFOBLIG',
  UnknownReferenceObligation: 'UNKREFOBLIG',
  AllGuarantees: 'ALLGUARANTEES',
  ReferencePrice: 'REFPX',
  ReferencePolicy: 'REFPOLICY',
  SecuredList: 'SECRDLIST',
  InterestPayoffOfRollingOrAmendingTrade: 'PAYOFF',
} as const);

/** `StrategyParameterType` values (`FIX::StrategyParameterType_*`). */
export const StrategyParameterType = /* @__PURE__ */ Object.freeze({
  Int: '1',
  Length: '2',
  NumInGroup: '3',
  SeqNum: '4',
  TagNum: '5',
  Float: '6',
  Qty: '7',
  Price: '8',
  PriceOffset: '9',
  Amt: '10',
  Percentage: '11',
  Char: '12',
  Boolean: '13',
  String: '14',
  MultipleCharValue: '15',
  Currency: '16',
  Exchange: '17',
  MonthYear: '18',
  UtcTimestamp: '19',
  UtcTimeOnly: '20',
  LocalMktDate: '21',
  UtcDateOnly: '22',
  Data: '23',
  MultipleStringValue: '24',
  Country: '25',
  Language: '26',
  TzTimeOnly: '27',
  TzTimestamp: '28',
  Tenor: '29',
} as const);

/** `StrategyType` values (`FIX::StrategyType_*`). */
export const StrategyType = /* @__PURE__ */ Object.freeze({
  Straddle: 'STD',
  Strangle: 'STG',
  Butterfly: 'BF',
  Condor: 'CNDR',
  CallableInversibleSnowball: 'CISN',
  Other: 'OTHER',
} as const);

/** `StreamAsgnAckType` values (`FIX::StreamAsgnAckType_*`). */
export const StreamAsgnAckType = /* @__PURE__ */ Object.freeze({
  AssignmentAccepted: '0',
  AssignmentRejected: '1',
} as const);

/** `StreamAsgnRejReason` values (`FIX::StreamAsgnRejReason_*`). */
export const StreamAsgnRejReason = /* @__PURE__ */ Object.freeze({
  UnknownClient: '0',
  ExceedsMaximumSize: '1',
  UnknownOrInvalidCurrencyPair: '2',
  NoAvailableStream: '3',
  Other: '99',
} as const);

/** `StreamAsgnReqType` values (`FIX::StreamAsgnReqType_*`). */
export const StreamAsgnReqType = /* @__PURE__ */ Object.freeze({
  StreamAssignmentForNewCustomer: '1',
  StreamAssignmentForExistingCustomer: '2',
} as const);

/** `StreamAsgnType` values (`FIX::StreamAsgnType_*`). */
export const StreamAsgnType = /* @__PURE__ */ Object.freeze({
  Assignment: '1',
  Rejected: '2',
  Terminate: '3',
} as const);

/** `StreamCommodityDataSourceIDType` values (`FIX::StreamCommodityDataSourceIDType_*`). */
export const StreamCommodityDataSourceIDType = /* @__PURE__ */ Object.freeze({
  City: '0',
  Airport: '1',
  WeatherStation: '2',
  WeatherIndex: '3',
} as const);

/** `StreamCommodityNearbySettlDayUnit` values (`FIX::StreamCommodityNearbySettlDayUnit_*`). */
export const StreamCommodityNearbySettlDayUnit = /* @__PURE__ */ Object.freeze({
  Week: 'Wk',
  Month: 'Mo',
} as const);

/** `StreamCommoditySettlDateRollUnit` values (`FIX::StreamCommoditySettlDateRollUnit_*`). */
export const StreamCommoditySettlDateRollUnit = /* @__PURE__ */ Object.freeze({
  Day: 'D',
} as const);

/** `StreamNotionalAdjustments` values (`FIX::StreamNotionalAdjustments_*`). */
export const StreamNotionalAdjustments = /* @__PURE__ */ Object.freeze({
  Execution: '0',
  PortfolioRebalancing: '1',
  Standard: '2',
} as const);

/** `StreamNotionalCommodityFrequency` values (`FIX::StreamNotionalCommodityFrequency_*`). */
export const StreamNotionalCommodityFrequency = /* @__PURE__ */ Object.freeze({
  Term: '0',
  PerBusinessDay: '1',
  PerCalculationPeriod: '2',
  PerSettlPeriod: '3',
  PerCalendarDay: '4',
  PerHour: '5',
  PerMonth: '6',
} as const);

/** `StreamType` values (`FIX::StreamType_*`). */
export const StreamType = /* @__PURE__ */ Object.freeze({
  PaymentCashSettlement: '0',
  PhysicalDelivery: '1',
} as const);

/** `StrikeIndexQuote` values (`FIX::StrikeIndexQuote_*`). */
export const StrikeIndexQuote = /* @__PURE__ */ Object.freeze({
  Bid: '0',
  Mid: '1',
  Offer: '2',
} as const);

/** `StrikePriceBoundaryMethod` values (`FIX::StrikePriceBoundaryMethod_*`). */
export const StrikePriceBoundaryMethod = /* @__PURE__ */ Object.freeze({
  LessThan: '1',
  LessThanOrEqual: '2',
  Equal: '3',
  GreaterThanOrEqual: '4',
  GreaterThan: '5',
} as const);

/** `StrikePriceDeterminationMethod` values (`FIX::StrikePriceDeterminationMethod_*`). */
export const StrikePriceDeterminationMethod = /* @__PURE__ */ Object.freeze({
  FixedStrike: '1',
  StrikeSetAtExpiration: '2',
  StrikeSetToAverageAcrossLife: '3',
  StrikeSetToOptimalValue: '4',
} as const);

/** `SubscriptionRequestType` values (`FIX::SubscriptionRequestType_*`). */
export const SubscriptionRequestType = /* @__PURE__ */ Object.freeze({
  Snapshot: '0',
  SnapshotAndUpdates: '1',
  DisablePreviousSnapshot: '2',
} as const);

/** `SwapClass` values (`FIX::SwapClass_*`). */
export const SwapClass = /* @__PURE__ */ Object.freeze({
  BasisSwap: 'BS',
  IndexSwap: 'IX',
  BroadBasedSecuritySwap: 'BB',
  BasketSwap: 'SK',
} as const);

/** `SwapSubClass` values (`FIX::SwapSubClass_*`). */
export const SwapSubClass = /* @__PURE__ */ Object.freeze({
  Amortizing: 'AMTZ',
  Compounding: 'COMP',
  ConstantNotionalSchedule: 'CNST',
  AccretingNotionalSchedule: 'ACRT',
  CustomNotionalSchedule: 'CUST',
} as const);

/** `SymbolSfx` values (`FIX::SymbolSfx_*`). */
export const SymbolSfx = /* @__PURE__ */ Object.freeze({
  EucpWithLumpSumInterest: 'CD',
  WhenIssued: 'WI',
} as const);

/** `TargetStrategy` values (`FIX::TargetStrategy_*`). */
export const TargetStrategy = /* @__PURE__ */ Object.freeze({
  Vwap: '1',
  Participate: '2',
  MininizeMarketImpact: '3',
} as const);

/** `TaxAdvantageType` values (`FIX::TaxAdvantageType_*`). */
export const TaxAdvantageType = /* @__PURE__ */ Object.freeze({
  ProfitSharingPlan: '19',
  EmployerPriorYear: '11',
  EmployerCurrentYear: '12',
  NonFundPrototypeIra: '13',
  NonFundQualifiedPlan: '14',
  DefinedContributionPlan: '15',
  EmployeeCurrentYear: '10',
  IraRollover: '17',
  MiniInsuranceIsa: '5',
  Ira: '16',
  EmployeePriorYear: '9',
  AssetTransfer: '8',
  SelfDirectedIra: '21',
  CurrentYearPayment: '6',
  Us401K: '20',
  MiniStocksAndSharesIsa: '4',
  MiniCashIsa: '3',
  Tessa: '2',
  MaxiIsa: '1',
  None: '0',
  PriorYearPayment: '7',
  Us457: '23',
  RothIraPrototype: '24',
  RothIraNonPrototype: '25',
  RothConversionIraPrototype: '26',
  RothConversionIraNonPrototype: '27',
  EducationIraPrototype: '28',
  EducationIraNonPrototype: '29',
  Keogh: '18',
  Us403b: '22',
  Other: '999',
} as const);

/** `TaxonomyType` values (`FIX::TaxonomyType_*`). */
export const TaxonomyType = /* @__PURE__ */ Object.freeze({
  IsinOrAltInstrmtId: 'I',
  InterimTaxonomy: 'E',
} as const);

/** `TerminationType` values (`FIX::TerminationType_*`). */
export const TerminationType = /* @__PURE__ */ Object.freeze({
  Overnight: '1',
  Term: '2',
  Flexible: '3',
  Open: '4',
} as const);

/** `TestMessageIndicator` values (`FIX::TestMessageIndicator_*`). */
export const TestMessageIndicator = /* @__PURE__ */ Object.freeze({
  No: 'N',
  Yes: 'Y',
} as const);

/** `ThrottleAction` values (`FIX::ThrottleAction_*`). */
export const ThrottleAction = /* @__PURE__ */ Object.freeze({
  QueueInbound: '0',
  QueueOutbound: '1',
  Reject: '2',
  Disconnect: '3',
  Warning: '4',
} as const);

/** `ThrottleCountIndicator` values (`FIX::ThrottleCountIndicator_*`). */
export const ThrottleCountIndicator = /* @__PURE__ */ Object.freeze({
  OutstandingRequestsUnchanged: '0',
  OutstandingRequestsDecreased: '1',
} as const);

/** `ThrottleInst` values (`FIX::ThrottleInst_*`). */
export const ThrottleInst = /* @__PURE__ */ Object.freeze({
  RejectIfThrottleLimitExceeded: '0',
  QueueIfThrottleLimitExceeded: '1',
} as const);

/** `ThrottleStatus` values (`FIX::ThrottleStatus_*`). */
export const ThrottleStatus = /* @__PURE__ */ Object.freeze({
  ThrottleLimitNotExceededNotQueued: '0',
  QueuedDueToThrottleLimitExceeded: '1',
} as const);

/** `ThrottleType` values (`FIX::ThrottleType_*`). */
export const ThrottleType = /* @__PURE__ */ Object.freeze({
  InboundRate: '0',
  OutstandingRequests: '1',
} as const);

/** `TickDirection` values (`FIX::TickDirection_*`). */
export const TickDirection = /* @__PURE__ */ Object.freeze({
  PlusTick: '0',
  ZeroPlusTick: '1',
  MinusTick: '2',
  ZeroMinusTick: '3',
} as const);

/** `TickRuleType` values (`FIX::TickRuleType_*`). */
export const TickRuleType = /* @__PURE__ */ Object.freeze({
  Regular: '0',
  Variable: '1',
  Fixed: '2',
  TradedAsASpreadLeg: '3',
  SettledAsASpreadLeg: '4',
  RegularTrading: '0',
  VariableCabinet: '1',
  FixedCabinet: '2',
  TradedAsSpread: '5',
} as const);

/** `TimeInForce` values (`FIX::TimeInForce_*`). */
export const TimeInForce = /* @__PURE__ */ Object.freeze({
  Day: '0',
  GoodTillCancel: '1',
  AtTheOpening: '2',
  ImmediateOrCancel: '3',
  FillOrKill: '4',
  GoodTillCrossing: '5',
  GoodTillDate: '6',
  AtTheClose: '7',
  GoodThroughCrossing: '8',
  AtCrossing: '9',
  GoodForTime: 'A',
  GoodForAuction: 'B',
  GoodForMonth: 'C',
} as const);

/** `TimeUnit` values (`FIX::TimeUnit_*`). */
export const TimeUnit = /* @__PURE__ */ Object.freeze({
  Hour: 'H',
  Minute: 'Min',
  Second: 'S',
  Day: 'D',
  Week: 'Wk',
  Month: 'Mo',
  Year: 'Yr',
  Quarter: 'Q',
} as const);

/** `TradSesControl` values (`FIX::TradSesControl_*`). */
export const TradSesControl = /* @__PURE__ */ Object.freeze({
  Automatic: '0',
  Manual: '1',
} as const);

/** `TradSesEvent` values (`FIX::TradSesEvent_*`). */
export const TradSesEvent = /* @__PURE__ */ Object.freeze({
  TradingResumes: '0',
  ChangeOfTradingSession: '1',
  ChangeOfTradingSubsession: '2',
  ChangeOfTradingStatus: '3',
} as const);

/** `TradSesMethod` values (`FIX::TradSesMethod_*`). */
export const TradSesMethod = /* @__PURE__ */ Object.freeze({
  Electronic: '1',
  OpenOutcry: '2',
  TwoParty: '3',
  Voice: '4',
} as const);

/** `TradSesMode` values (`FIX::TradSesMode_*`). */
export const TradSesMode = /* @__PURE__ */ Object.freeze({
  Testing: '1',
  Simulated: '2',
  Production: '3',
} as const);

/** `TradSesStatus` values (`FIX::TradSesStatus_*`). */
export const TradSesStatus = /* @__PURE__ */ Object.freeze({
  Halted: '1',
  Open: '2',
  Closed: '3',
  PreOpen: '4',
  PreClose: '5',
  RequestRejected: '6',
  Unknown: '0',
} as const);

/** `TradSesStatusRejReason` values (`FIX::TradSesStatusRejReason_*`). */
export const TradSesStatusRejReason = /* @__PURE__ */ Object.freeze({
  UnknownOrInvalidTradingSessionId: '1',
  Other: '99',
} as const);

/** `TradeAggregationRejectReason` values (`FIX::TradeAggregationRejectReason_*`). */
export const TradeAggregationRejectReason = /* @__PURE__ */ Object.freeze({
  UnknownOrders: '0',
  UnknownExecutionFills: '1',
  Other: '99',
} as const);

/** `TradeAggregationRequestStatus` values (`FIX::TradeAggregationRequestStatus_*`). */
export const TradeAggregationRequestStatus = /* @__PURE__ */ Object.freeze({
  Accepted: '0',
  Rejected: '1',
} as const);

/** `TradeAggregationTransType` values (`FIX::TradeAggregationTransType_*`). */
export const TradeAggregationTransType = /* @__PURE__ */ Object.freeze({
  New: '0',
  Cancel: '1',
  Replace: '2',
} as const);

/** `TradeAllocGroupInstruction` values (`FIX::TradeAllocGroupInstruction_*`). */
export const TradeAllocGroupInstruction = /* @__PURE__ */ Object.freeze({
  Add: '0',
  DoNotAdd: '1',
} as const);

/** `TradeAllocIndicator` values (`FIX::TradeAllocIndicator_*`). */
export const TradeAllocIndicator = /* @__PURE__ */ Object.freeze({
  AllocationNotRequired: '0',
  AllocationRequired: '1',
  UseAllocationProvidedWithTheTrade: '2',
  AllocationGiveUpExecutor: '3',
  AllocationFromExecutor: '4',
  AllocationToClaimAccount: '5',
  TradeSplit: '6',
} as const);

/** `TradeAllocStatus` values (`FIX::TradeAllocStatus_*`). */
export const TradeAllocStatus = /* @__PURE__ */ Object.freeze({
  PendingClear: '0',
  Claimed: '1',
  Cleared: '2',
  Rejected: '3',
} as const);

/** `TradeCollateralization` values (`FIX::TradeCollateralization_*`). */
export const TradeCollateralization = /* @__PURE__ */ Object.freeze({
  Uncollateralized: '0',
  PartiallyCollateralized: '1',
  OneWayCollaterallization: '2',
  FullyCollateralized: '3',
  NetExposure: '4',
} as const);

/** `TradeCondition` values (`FIX::TradeCondition_*`). */
export const TradeCondition = /* @__PURE__ */ Object.freeze({
  Cash: 'A',
  AveragePriceTrade: 'B',
  CashTrade: 'C',
  NextDay: 'D',
  Opening: 'E',
  IntradayTradeDetail: 'F',
  Rule127Trade: 'G',
  Rule155Trade: 'H',
  SoldLast: 'I',
  NextDayTrade: 'J',
  Opened: 'K',
  Seller: 'L',
  Sold: 'M',
  StoppedStock: 'N',
  ImbalanceMoreBuyers: 'P',
  ImbalanceMoreSellers: 'Q',
  OpeningPrice: 'R',
  BargainCondition: 'S',
  ConvertedPriceIndicator: 'T',
  ExchangeLast: 'U',
  FinalPriceOfSession: 'V',
  ExPit: 'W',
  Crossed: 'X',
  TradesResultingFromManual: 'Y',
  TradesResultingFromIntermarketSweep: 'Z',
  VolumeOnly: 'a',
  DirectPlus: 'b',
  Acquisition: 'c',
  Bunched: 'd',
  Distribution: 'e',
  BunchedSale: 'f',
  SplitTrade: 'g',
  CancelStopped: 'h',
  CancelEth: 'i',
  CancelStoppedEth: 'j',
  OutOfSequenceEth: 'k',
  CancelLastEth: 'l',
  SoldLastSaleEth: 'm',
  CancelLast: 'n',
  SoldLastSale: 'o',
  CancelOpen: 'p',
  CancelOpenEth: 'q',
  OpenedSaleEth: 'r',
  CancelOnly: 's',
  CancelOnlyEth: 't',
  LateOpenEth: 'u',
  AutoExecutionEth: 'v',
  Reopen: 'w',
  ReopenEth: 'x',
  Adjusted: 'y',
  AdjustedEth: 'z',
  Spread: 'AA',
  SpreadEth: 'AB',
  Straddle: 'AC',
  StraddleEth: 'AD',
  Stopped: 'AE',
  StoppedEth: 'AF',
  RegularEth: 'AG',
  Combo: 'AH',
  ComboEth: 'AI',
  OfficialClosingPrice: 'AJ',
  PriorReferencePrice: 'AK',
  Cancel: '0',
  StoppedSoldLast: 'AL',
  StoppedOutOfSequence: 'AM',
  OfficalClosingPrice: 'AN',
  CrossedOld: 'AO',
  FastMarket: 'AP',
  AutomaticExecution: 'AQ',
  FormT: 'AR',
  BasketIndex: 'AS',
  BurstBasket: 'AT',
  OutsideSpread: 'AV',
  ImpliedTrade: '1',
  MarketplaceEnteredTrade: '2',
  MultAssetClassMultilegTrade: '3',
  MultilegToMultilegTrade: '4',
  OfficialClosingPriceDup: 'AN',
  TradeThroughExempt: 'AU',
  QuoteSpread: 'AV',
  LastAuctionPrice: 'AW',
  HighPrice: 'AX',
  LowPrice: 'AY',
  SystematicInternaliser: 'AZ',
  AwayMarket: 'BA',
  MidpointPrice: 'BB',
  TradedBeforeIssueDate: 'BC',
  PreviousClosingPrice: 'BD',
  NationalBestBidOffer: 'BE',
  MultiAssetClassMultilegTrade: '3',
  ShortSaleMinPrice: '5',
  Benchmark: '6',
} as const);

/** `TradeContingency` values (`FIX::TradeContingency_*`). */
export const TradeContingency = /* @__PURE__ */ Object.freeze({
  DoesNotApply: '0',
  ContingentTrade: '1',
  NonContingentTrade: '2',
} as const);

/** `TradeContinuation` values (`FIX::TradeContinuation_*`). */
export const TradeContinuation = /* @__PURE__ */ Object.freeze({
  Novation: '0',
  PartialNovation: '1',
  TradeUnwind: '2',
  PartialTradeUnwind: '3',
  Exercise: '4',
  Netting: '5',
  FullNetting: '6',
  PartialNetting: '7',
  Amendment: '8',
  Increase: '9',
  CreditEvent: '10',
  StrategicRestructuring: '11',
  SuccessionEventReorganization: '12',
  SuccessionEventRenaming: '13',
  Porting: '14',
  Withdrawl: '15',
  Void: '16',
  AccountTransfer: '17',
  GiveUp: '18',
  TakeUp: '19',
  AveragePricing: '20',
  Reversal: '21',
  AllocTrdPosting: '22',
  Cascade: '23',
  Delivery: '24',
  OptionAsgn: '25',
  Expiration: '26',
  Maturity: '27',
  EqualPosAdj: '28',
  UnequalPosAdj: '29',
  Correction: '30',
  EarlyTermination: '31',
  Rerate: '32',
  Other: '99',
} as const);

/** `TradeHandlingInstr` values (`FIX::TradeHandlingInstr_*`). */
export const TradeHandlingInstr = /* @__PURE__ */ Object.freeze({
  TradeConfirmation: '0',
  TwoPartyReport: '1',
  OnePartyReportForMatching: '2',
  OnePartyReportForPassThrough: '3',
  AutomatedFloorOrderRouting: '4',
  TwoPartyReportForClaim: '5',
  OnePartyReport: '6',
  ThirdPtyRptForPassThrough: '7',
  OnePartyReportAutoMatch: '8',
} as const);

/** `TradeMatchAckStatus` values (`FIX::TradeMatchAckStatus_*`). */
export const TradeMatchAckStatus = /* @__PURE__ */ Object.freeze({
  ReceivedNotProcessed: '0',
  Accepted: '1',
  Rejected: '2',
} as const);

/** `TradeMatchRejectReason` values (`FIX::TradeMatchRejectReason_*`). */
export const TradeMatchRejectReason = /* @__PURE__ */ Object.freeze({
  Successful: '0',
  InvalidPartyInformation: '1',
  UnknownInstrument: '2',
  Unauthorized: '3',
  InvalidTradeType: '4',
  Other: '99',
} as const);

/** `TradePriceCondition` values (`FIX::TradePriceCondition_*`). */
export const TradePriceCondition = /* @__PURE__ */ Object.freeze({
  SpecialCumDividend: '0',
  SpecialCumRights: '1',
  SpecialExDividend: '2',
  SpecialExRights: '3',
  SpecialCumCoupon: '4',
  SpecialCumCapitalRepayments: '5',
  SpecialExCoupon: '6',
  SpecialExCapitalRepayments: '7',
  CashSettlement: '8',
  SpecialCumBonus: '9',
  SpecialPrice: '10',
  SpecialExBonus: '11',
  GuaranteedDelivery: '12',
  SpecialDividend: '13',
  PriceImprovement: '14',
  NonPriceFormingTrade: '15',
  TradeExemptedFromTradingObligation: '16',
  PricePending: '17',
  PriceNotApplicable: '18',
} as const);

/** `TradePriceNegotiationMethod` values (`FIX::TradePriceNegotiationMethod_*`). */
export const TradePriceNegotiationMethod = /* @__PURE__ */ Object.freeze({
  PercentPar: '0',
  DealSpread: '1',
  UpfrontPnts: '2',
  UpfrontAmt: '3',
  ParUpfrontAmt: '4',
  SpreadUpfrontAmt: '5',
  UpfrontPntsAmt: '6',
} as const);

/** `TradePublishIndicator` values (`FIX::TradePublishIndicator_*`). */
export const TradePublishIndicator = /* @__PURE__ */ Object.freeze({
  DoNotPublishTrade: '0',
  PublishTrade: '1',
  DeferredPublication: '2',
  Published: '3',
} as const);

/** `TradeQtyType` values (`FIX::TradeQtyType_*`). */
export const TradeQtyType = /* @__PURE__ */ Object.freeze({
  ClearedQuantity: '0',
  LongSideClaimedQuantity: '1',
  ShortSideClaimedQuantity: '2',
  LongSideRejectedQuantity: '3',
  ShortSideRejectedQuantity: '4',
  PendingQuantity: '5',
  TransactionQuantity: '6',
  RemainingQuantity: '7',
  PreviousRemainingQuantity: '8',
} as const);

/** `TradeReportRejectReason` values (`FIX::TradeReportRejectReason_*`). */
export const TradeReportRejectReason = /* @__PURE__ */ Object.freeze({
  Successful: '0',
  InvalidPartyOnformation: '1',
  UnknownInstrument: '2',
  UnauthorizedToReportTrades: '3',
  InvalidTradeType: '4',
  Other: '99',
  InvalidPartyInformation: '1',
  PriceExceedsCurrentPriceBand: '5',
  ReferencePriceNotAvailable: '6',
  NotionalValueExceedsThreshold: '7',
} as const);

/** `TradeReportTransType` values (`FIX::TradeReportTransType_*`). */
export const TradeReportTransType = /* @__PURE__ */ Object.freeze({
  New: '0',
  Replace: '2',
  Cancel: '1',
  Release: '3',
  Reverse: '4',
  CancelDueToBackOutOfTrade: '5',
} as const);

/** `TradeReportType` values (`FIX::TradeReportType_*`). */
export const TradeReportType = /* @__PURE__ */ Object.freeze({
  Submit: '0',
  Alleged: '1',
  Accept: '2',
  Decline: '3',
  Addendum: '4',
  No: '5',
  TradeReportCancel: '6',
  LockedIn: '7',
  Defaulted: '8',
  InvalidCmta: '9',
  Pended: '10',
  AllegedNew: '11',
  AllegedAddendum: '12',
  AllegedNo: '13',
  AllegedTradeReportCancel: '14',
  AllegedTradeBreak: '15',
  Verify: '16',
  Dispute: '17',
  NonMaterialUpdate: '18',
} as const);

/** `TradeReportingIndicator` values (`FIX::TradeReportingIndicator_*`). */
export const TradeReportingIndicator = /* @__PURE__ */ Object.freeze({
  NotReported: '0',
  OnBook: '1',
  SiSeller: '2',
  SiBuyer: '3',
  NonSiSeller: '4',
  SubDelegationByFirm: '5',
  Reportable: '6',
  NonSiBuyer: '7',
  OffBook: '8',
  NotReportable: '9',
} as const);

/** `TradeRequestResult` values (`FIX::TradeRequestResult_*`). */
export const TradeRequestResult = /* @__PURE__ */ Object.freeze({
  Successful: '0',
  InvalidOrUnknownInstrument: '1',
  InvalidTypeOfTradeRequested: '2',
  InvalidParties: '3',
  InvalidTransportTypeRequested: '4',
  InvalidDestinationRequested: '5',
  TradeRequestTypeNotSupported: '8',
  NotAuthorized: '9',
  Other: '99',
} as const);

/** `TradeRequestStatus` values (`FIX::TradeRequestStatus_*`). */
export const TradeRequestStatus = /* @__PURE__ */ Object.freeze({
  Accepted: '0',
  Completed: '1',
  Rejected: '2',
} as const);

/** `TradeRequestType` values (`FIX::TradeRequestType_*`). */
export const TradeRequestType = /* @__PURE__ */ Object.freeze({
  AdvisoriesThatMatchCriteria: '4',
  UnreportedTradesThatMatchCriteria: '3',
  UnmatchedTradesThatMatchCriteria: '2',
  MatchedTradesMatchingCriteria: '1',
  AllTrades: '0',
} as const);

/** `TradeType` values (`FIX::TradeType_*`). */
export const TradeType = /* @__PURE__ */ Object.freeze({
  Agency: 'A',
  VwapGuarantee: 'G',
  GuaranteedClose: 'J',
  RiskTrade: 'R',
} as const);

/** `TradeVolType` values (`FIX::TradeVolType_*`). */
export const TradeVolType = /* @__PURE__ */ Object.freeze({
  NumberOfUnits: '0',
  NumberOfRoundLots: '1',
} as const);

/** `TradedFlatSwitch` values (`FIX::TradedFlatSwitch_*`). */
export const TradedFlatSwitch = /* @__PURE__ */ Object.freeze({
  No: 'N',
  Yes: 'Y',
} as const);

/** `TradingCapacity` values (`FIX::TradingCapacity_*`). */
export const TradingCapacity = /* @__PURE__ */ Object.freeze({
  Customer: '1',
  CustomerProfessional: '2',
  BrokerDealer: '3',
  CustomerBrokerDealer: '4',
  Principal: '5',
  MarketMaker: '6',
  AwayMarketMaker: '7',
  SystematicInternaliser: '8',
} as const);

/** `TradingSessionID` values (`FIX::TradingSessionID_*`). */
export const TradingSessionID = /* @__PURE__ */ Object.freeze({
  Day: '1',
  HalfDay: '2',
  Morning: '3',
  Afternoon: '4',
  Evening: '5',
  AfterHours: '6',
  Holiday: '7',
} as const);

/** `TradingSessionSubID` values (`FIX::TradingSessionSubID_*`). */
export const TradingSessionSubID = /* @__PURE__ */ Object.freeze({
  PreTrading: '1',
  OpeningOrOpeningAuction: '2',
  Continuous: '3',
  ClosingOrClosingAuction: '4',
  PostTrading: '5',
  IntradayAuction: '6',
  Quiescent: '7',
  ScheduledIntradayAuction: '6',
  AnyAuction: '8',
  UnscheduledIntradayAuction: '9',
  OutOfMainSessionTrading: '10',
  PrivateAuction: '11',
  PublicAuction: '12',
  GroupAuction: '13',
} as const);

/** `TransactionAttributeType` values (`FIX::TransactionAttributeType_*`). */
export const TransactionAttributeType = /* @__PURE__ */ Object.freeze({
  ExclusiveArrangement: '0',
  CollateralReuse: '1',
  CollateralArrangmentType: '2',
} as const);

/** `TransferRejectReason` values (`FIX::TransferRejectReason_*`). */
export const TransferRejectReason = /* @__PURE__ */ Object.freeze({
  Success: '0',
  InvalidParty: '1',
  UnknownInstrument: '2',
  UnauthorizedToSubmitXfer: '3',
  UnknownPosition: '4',
  Other: '99',
} as const);

/** `TransferReportType` values (`FIX::TransferReportType_*`). */
export const TransferReportType = /* @__PURE__ */ Object.freeze({
  Submit: '0',
  Alleged: '1',
} as const);

/** `TransferScope` values (`FIX::TransferScope_*`). */
export const TransferScope = /* @__PURE__ */ Object.freeze({
  InterFirmTransfer: '0',
  IntraFirmTransfer: '1',
  Cmta: '2',
} as const);

/** `TransferStatus` values (`FIX::TransferStatus_*`). */
export const TransferStatus = /* @__PURE__ */ Object.freeze({
  Received: '0',
  RejectedByIntermediary: '1',
  AcceptPending: '2',
  Accepted: '3',
  Declined: '4',
  Cancelled: '5',
} as const);

/** `TransferTransType` values (`FIX::TransferTransType_*`). */
export const TransferTransType = /* @__PURE__ */ Object.freeze({
  New: '0',
  Replace: '1',
  Cancel: '2',
} as const);

/** `TransferType` values (`FIX::TransferType_*`). */
export const TransferType = /* @__PURE__ */ Object.freeze({
  RequestTransfer: '0',
  AcceptTransfer: '1',
  DeclineTransfer: '2',
} as const);

/** `TrdAckStatus` values (`FIX::TrdAckStatus_*`). */
export const TrdAckStatus = /* @__PURE__ */ Object.freeze({
  Accepted: '0',
  Rejected: '1',
  Received: '2',
} as const);

/** `TrdRegPublicationReason` values (`FIX::TrdRegPublicationReason_*`). */
export const TrdRegPublicationReason = /* @__PURE__ */ Object.freeze({
  NoBookOrderDueToAverageSpreadPrice: '0',
  NoBookOrderDueToRefPrice: '1',
  NoBookOrderDueToOtherConditions: '2',
  NoPublicPriceDueToRefPrice: '3',
  NoPublicPriceDueToIlliquid: '4',
  NoPublicPriceDueToOrderSize: '5',
  DeferralDueToLargeInScale: '6',
  DeferralDueToIlliquid: '7',
  DeferralDueToSizeSpecific: '8',
  NoPublicPriceDueToLargeInScale: '9',
  NoPublicPriceSizeDueToOrderHidden: '10',
  ExemptedDueToSecuritiesFinancingTransaction: '11',
  ExemptedDueToEscbPolicyTransaction: '12',
  ExceptionDueToReportByPaper: '13',
  ExceptionDueToTradeExecutedWithNonReportingParty: '14',
  ExceptionDueToIntraFirmOrder: '15',
  ReportedOutsideReportingHours: '16',
} as const);

/** `TrdRegPublicationType` values (`FIX::TrdRegPublicationType_*`). */
export const TrdRegPublicationType = /* @__PURE__ */ Object.freeze({
  PreTradeTransparencyWaiver: '0',
  PostTradeDeferral: '1',
  ExemptFromPublication: '2',
  OrderLevelPublicationToSubscribers: '3',
  PriceLevelPublicationToSubscribers: '4',
  OrderLevelPublicationToThePublic: '5',
  PublicationInternalToExecutionVenue: '6',
} as const);

/** `TrdRegTimestampManualIndicator` values (`FIX::TrdRegTimestampManualIndicator_*`). */
export const TrdRegTimestampManualIndicator = /* @__PURE__ */ Object.freeze({
  No: 'N',
  Yes: 'Y',
} as const);

/** `TrdRegTimestampType` values (`FIX::TrdRegTimestampType_*`). */
export const TrdRegTimestampType = /* @__PURE__ */ Object.freeze({
  ExecutionTime: '1',
  TimeIn: '2',
  TimeOut: '3',
  BrokerReceipt: '4',
  BrokerExecution: '5',
  DeskReceipt: '6',
  SubmissionToClearing: '7',
  TimePriority: '8',
  OrderbookEntryTime: '9',
  OrderSubmissionTime: '10',
  PubliclyReported: '11',
  PublicReportUpdated: '12',
  NonPubliclyReported: '13',
  NonPublicReportUpdated: '14',
  SubmittedForConfirmation: '15',
  UpdatedForConfirmation: '16',
  Confirmed: '17',
  UpdatedForClearing: '18',
  Cleared: '19',
  AllocationsSubmitted: '20',
  AllocationsUpdated: '21',
  AllocationsCompleted: '22',
  SubmittedToRepository: '23',
  PostTrdContntnEvnt: '24',
  PostTradeValuation: '25',
  PreviousTimePriority: '26',
  IdentifierAssigned: '27',
  PreviousIdentifierAssigned: '28',
  OrderCancellationTime: '29',
  OrderModificationTime: '30',
  OrderRoutingTime: '31',
  TradeCancellationTime: '32',
  TradeModificationTime: '33',
  ReferenceTimeForNbbo: '34',
} as const);

/** `TrdRptStatus` values (`FIX::TrdRptStatus_*`). */
export const TrdRptStatus = /* @__PURE__ */ Object.freeze({
  Accepted: '0',
  Rejected: '1',
  AcceptedWithErrors: '3',
  Cancelled: '2',
  PendingNew: '4',
  PendingCancel: '5',
  PendingReplace: '6',
  Terminated: '7',
  PendingVerification: '8',
  DeemedVerified: '9',
  Verified: '10',
  Disputed: '11',
} as const);

/** `TrdSubType` values (`FIX::TrdSubType_*`). */
export const TrdSubType = /* @__PURE__ */ Object.freeze({
  Cmta: '0',
  InternalTransferOrAdjustment: '1',
  ExternalTransferOrTransferOfAccount: '2',
  RejectForSubmittingSide: '3',
  AdvisoryForContraSide: '4',
  OffsetDueToAnAllocation: '5',
  OnsetDueToAnAllocation: '6',
  DifferentialSpread: '7',
  ImpliedSpreadLegExecutedAgainstAnOutright: '8',
  TransactionFromExercise: '9',
  TransactionFromAssignment: '10',
  Acats: '11',
  Ai: '14',
  B: '15',
  K: '16',
  Lc: '17',
  M: '18',
  N: '19',
  Nm: '20',
  Nr: '21',
  P: '22',
  Pa: '23',
  Pc: '24',
  Pn: '25',
  R: '26',
  Ro: '27',
  Rt: '28',
  Sw: '29',
  T: '30',
  Wn: '31',
  Wt: '32',
  OffHoursTrade: '33',
  OnHoursTrade: '34',
  OtcQuote: '35',
  ConvertedSwap: '36',
  CrossedTrade: '37',
  InterimProtectedTrade: '38',
  LargeInScale: '39',
  WashTrade: '40',
  TradeAtSettlement: '41',
  AuctionTrade: '42',
  TradeAtMarker: '43',
  CreditDefault: '44',
  CreditRestructuring: '45',
  Merger: '46',
  SpinOff: '47',
  MultilateralCompression: '48',
  Balancing: '50',
  BasisTradeIndexClose: '51',
  TradeAtCashOpen: '52',
  TrdSubmitVenueClrSettl: '53',
  BilateralCompression: '54',
} as const);

/** `TrdType` values (`FIX::TrdType_*`). */
export const TrdType = /* @__PURE__ */ Object.freeze({
  RegularTrade: '0',
  BlockTrade: '1',
  Efp: '2',
  Transfer: '3',
  LateTrade: '4',
  TTrade: '5',
  WeightedAveragePriceTrade: '6',
  BunchedTrade: '7',
  LateBunchedTrade: '8',
  PriorReferencePriceTrade: '9',
  AfterHoursTrade: '10',
  ExchangeForRisk: '11',
  ExchangeForSwap: '12',
  ExchangeOfFuturesFor: '13',
  ExchangeOfOptionsForOptions: '14',
  TradingAtSettlement: '15',
  AllOrNone: '16',
  FuturesLargeOrderExecution: '17',
  ExchangeOfFuturesForFutures: '18',
  OptionInterimTrade: '19',
  OptionCabinetTrade: '20',
  PrivatelyNegotiatedTrades: '22',
  SubstitutionOfFuturesForForwards: '23',
  ErrorTrade: '24',
  SpecialCumDividend: '25',
  SpecialExDividend: '26',
  SpecialCumCoupon: '27',
  SpecialExCoupon: '28',
  CashSettlement: '29',
  SpecialPrice: '30',
  GuaranteedDelivery: '31',
  SpecialCumRights: '32',
  SpecialExRights: '33',
  SpecialCumCapitalRepayments: '34',
  SpecialExCapitalRepayments: '35',
  SpecialCumBonus: '36',
  SpecialExBonus: '37',
  LargeTrade: '38',
  WorkedPrincipalTrade: '39',
  BlockTrades: '40',
  NameChange: '41',
  PortfolioTransfer: '42',
  ProrogationBuy: '43',
  ProrogationSell: '44',
  OptionExercise: '45',
  DeltaNeutralTransaction: '46',
  FinancingTransaction: '47',
  NonStandardSettlement: '48',
  DerivativeRelatedTransaction: '49',
  PortfolioTrade: '50',
  VolumeWeightedAverageTrade: '51',
  ExchangeGrantedTrade: '52',
  RepurchaseAgreement: '53',
  Otc: '54',
  ExchangeBasisFacility: '55',
  OpeningTrade: '56',
  NettedTrade: '57',
  BlockSwapTrade: '58',
  CreditEventTrade: '59',
  SuccessionEventTrade: '60',
  GiveUpGiveInTrade: '61',
  DarkTrade: '62',
  TechnicalTrade: '63',
  Benchmark: '64',
  PackageTrade: '65',
  RollTrade: '66',
} as const);

/** `TriggerAction` values (`FIX::TriggerAction_*`). */
export const TriggerAction = /* @__PURE__ */ Object.freeze({
  Activate: '1',
  Modify: '2',
  Cancel: '3',
} as const);

/** `TriggerOrderType` values (`FIX::TriggerOrderType_*`). */
export const TriggerOrderType = /* @__PURE__ */ Object.freeze({
  Market: '1',
  Limit: '2',
} as const);

/** `TriggerPriceDirection` values (`FIX::TriggerPriceDirection_*`). */
export const TriggerPriceDirection = /* @__PURE__ */ Object.freeze({
  Up: 'U',
  Down: 'D',
} as const);

/** `TriggerPriceType` values (`FIX::TriggerPriceType_*`). */
export const TriggerPriceType = /* @__PURE__ */ Object.freeze({
  BestOffer: '1',
  LastTrade: '2',
  BestBid: '3',
  BestBidOrLastTrade: '4',
  BestOfferOrLastTrade: '5',
  BestMid: '6',
} as const);

/** `TriggerPriceTypeScope` values (`FIX::TriggerPriceTypeScope_*`). */
export const TriggerPriceTypeScope = /* @__PURE__ */ Object.freeze({
  None: '0',
  Local: '1',
  National: '2',
  Global: '3',
} as const);

/** `TriggerScope` values (`FIX::TriggerScope_*`). */
export const TriggerScope = /* @__PURE__ */ Object.freeze({
  ThisOrder: '0',
  OtherOrder: '1',
  AllOtherOrdersForGivenSecurity: '2',
  AllOtherOrdersForGivenSecurityAndPrice: '3',
  AllOtherOrdersForGivenSecurityAndSide: '4',
  AllOtherOrdersForGivenSecurityPriceAndSide: '5',
} as const);

/** `TriggerType` values (`FIX::TriggerType_*`). */
export const TriggerType = /* @__PURE__ */ Object.freeze({
  PartialExecution: '1',
  SpecifiedTradingSession: '2',
  NextAuction: '3',
  PriceMovement: '4',
  OnOrderEntryOrModification: '5',
} as const);

/** `Triggered` values (`FIX::Triggered_*`). */
export const Triggered = /* @__PURE__ */ Object.freeze({
  NotTriggered: '0',
  Triggered: '1',
  StopOrderTriggered: '2',
  OcoOrderTriggered: '3',
  OtoOrderTriggered: '4',
  OuoOrderTriggered: '5',
} as const);

/** `UnderlyingCashType` values (`FIX::UnderlyingCashType_*`). */
export const UnderlyingCashType = /* @__PURE__ */ Object.freeze({
  Fixed: 'FIXED',
  Diff: 'DIFF',
} as const);

/** `UnderlyingFXRateCalc` values (`FIX::UnderlyingFXRateCalc_*`). */
export const UnderlyingFXRateCalc = /* @__PURE__ */ Object.freeze({
  Divide: 'D',
  Multiply: 'M',
} as const);

/** `UnderlyingNotionalAdjustments` values (`FIX::UnderlyingNotionalAdjustments_*`). */
export const UnderlyingNotionalAdjustments = /* @__PURE__ */ Object.freeze({
  Execution: '0',
  PortfolioRebalancing: '1',
  Standard: '2',
} as const);

/** `UnderlyingObligationType` values (`FIX::UnderlyingObligationType_*`). */
export const UnderlyingObligationType = /* @__PURE__ */ Object.freeze({
  Bond: '0',
  ConvertibleBond: '1',
  Mortgage: '2',
  Loan: '3',
} as const);

/** `UnderlyingPriceDeterminationMethod` values (`FIX::UnderlyingPriceDeterminationMethod_*`). */
export const UnderlyingPriceDeterminationMethod = /* @__PURE__ */ Object.freeze({
  Regular: '1',
  SpecialReference: '2',
  OptimalValue: '3',
  AverageValue: '4',
} as const);

/** `UnderlyingSettlementType` values (`FIX::UnderlyingSettlementType_*`). */
export const UnderlyingSettlementType = /* @__PURE__ */ Object.freeze({
  TPlus1: '2',
  TPlus3: '4',
  TPlus4: '5',
} as const);

/** `UnitOfMeasure` values (`FIX::UnitOfMeasure_*`). */
export const UnitOfMeasure = /* @__PURE__ */ Object.freeze({
  BillionCubicFeet: 'Bcf',
  MillionBarrels: 'MMbbl',
  OneMillionBtu: 'MMBtu',
  MegawattHours: 'MWh',
  Barrels: 'Bbl',
  Bushels: 'Bu',
  Pounds: 'lbs',
  Gallons: 'Gal',
  TroyOunces: 'oz_tr',
  MetricTons: 't',
  Tons: 'tn',
  UsDollars: 'USD',
  CubicMeters: 'CBM',
  Gigajoules: 'GJ',
  HeatRate: 'kHR',
  KilowattHours: 'kWh',
  MegaHeatRate: 'MHR',
  Therms: 'thm',
  TonsOfCarbonDioxide: 'tnCO2',
  Allowances: 'Alw',
  BoardFeet: 'BDFT',
  Currency: 'Ccy',
  CoolingDegreeDay: 'CDD',
  CertifiedEmissionsReduction: 'CER',
  CriticalPrecipDay: 'CPD',
  ClimateReserveTonnes: 'CRT',
  Hundredweight: 'cwt',
  Day: 'day',
  DryMetricTons: 'dt',
  EnvAllwncCert: 'EnvAllwnc',
  EnvironmentalCredit: 'EnvCrd',
  EnvironmentalOffset: 'EnvOfst',
  Grams: 'g',
  GrossTons: 'GT',
  HeatingDegreeDay: 'HDD',
  IndexPoint: 'IPNT',
  Kilograms: 'kg',
  Kiloliters: 'kL',
  KilowattYear: 'kW-a',
  KilowattDay: 'kW-d',
  KilowattHour: 'kW-h',
  KilowattMonth: 'kW-M',
  KilowattMinute: 'kW-min',
  Liters: 'L',
  MegawattYear: 'MW-a',
  MegawattDay: 'MW-d',
  MegawattHour: 'MW-h',
  MegawattMonth: 'MW-M',
  MegawattMinute: 'MW-min',
  PrincipalWithRelationToDebtInstrument: 'PRINC',
  Are: 'a',
  Acre: 'ac',
  Centiliter: 'cL',
  Centimeter: 'cM',
  DieselGallonEquivalent: 'DGE',
  Foot: 'ft',
  GbGallon: 'Gal_gb',
  GasolineGallonEquivalent: 'GGE',
  Hectare: 'ha',
  Inch: 'in',
  Kilometer: 'kM',
  Meter: 'M',
  Mile: 'mi',
  Milliliter: 'mL',
  Millimeter: 'mM',
  UsOunce: 'oz',
  Piece: 'pc',
  UsPint: 'pt',
  GbPint: 'pt_gb',
  UsQuart: 'qt',
  GbQuart: 'qt_gb',
  SquareCentimeter: 'SqcM',
  SquareFoot: 'Sqft',
  SquareInch: 'Sqin',
  SquareKilometer: 'SqkM',
  SquareMeter: 'SqM',
  SquareMile: 'Sqmi',
  SquareMillimeter: 'SqmM',
  SquareYard: 'Sqyd',
  Yard: 'yd',
} as const);

/** `UnitofMeasure` values (`FIX::UnitofMeasure_*`). */
export const UnitofMeasure = /* @__PURE__ */ Object.freeze({
  Barrels: 'Bbl',
  BillionCubicFeet: 'Bcf',
  Bushels: 'Bu',
  Pounds: 'lbs',
  Gallons: 'Gal',
  MillionBarrels: 'MMbbl',
  OneMillionBtu: 'MMBtu',
  MegawattHours: 'MWh',
  TroyOunces: 'oz_tr',
  MetricTons: 't',
  Tons: 'tn',
  UsDollars: 'USD',
} as const);

/** `UnsolicitedIndicator` values (`FIX::UnsolicitedIndicator_*`). */
export const UnsolicitedIndicator = /* @__PURE__ */ Object.freeze({
  No: 'N',
  Yes: 'Y',
} as const);

/** `UpfrontPriceType` values (`FIX::UpfrontPriceType_*`). */
export const UpfrontPriceType = /* @__PURE__ */ Object.freeze({
  Percentage: '1',
  FixedAmount: '3',
} as const);

/** `Urgency` values (`FIX::Urgency_*`). */
export const Urgency = /* @__PURE__ */ Object.freeze({
  Normal: '0',
  Flash: '1',
  Background: '2',
} as const);

/** `UserRequestType` values (`FIX::UserRequestType_*`). */
export const UserRequestType = /* @__PURE__ */ Object.freeze({
  LogOnUser: '1',
  LogOffUser: '2',
  ChangePasswordForUser: '3',
  RequestIndividualUserStatus: '4',
  RequestThrottleLimit: '5',
} as const);

/** `UserStatus` values (`FIX::UserStatus_*`). */
export const UserStatus = /* @__PURE__ */ Object.freeze({
  LoggedIn: '1',
  NotLoggedIn: '2',
  UserNotRecognised: '3',
  PasswordIncorrect: '4',
  PasswordChanged: '5',
  Other: '6',
  ForcedUserLogoutByExchange: '7',
  SessionShutdownWarning: '8',
  ThrottleParametersChanged: '9',
} as const);

/** `ValuationMethod` values (`FIX::ValuationMethod_*`). */
export const ValuationMethod = /* @__PURE__ */ Object.freeze({
  PremiumStyle: 'EQTY',
  FuturesStyleMarkToMarket: 'FUT',
  FuturesStyleWithAnAttachedCashAdjustment: 'FUTDA',
  CdsStyleCollateralization: 'CDS',
  CdsInDeliveryUseRecoveryRateToCalculate: 'CDSD',
} as const);

/** `ValueCheckAction` values (`FIX::ValueCheckAction_*`). */
export const ValueCheckAction = /* @__PURE__ */ Object.freeze({
  DoNotCheck: '0',
  Check: '1',
  BestEffort: '2',
} as const);

/** `ValueCheckType` values (`FIX::ValueCheckType_*`). */
export const ValueCheckType = /* @__PURE__ */ Object.freeze({
  PriceCheck: '1',
  NotionalValueCheck: '2',
  QuantityCheck: '3',
} as const);

/** `VenueType` values (`FIX::VenueType_*`). */
export const VenueType = /* @__PURE__ */ Object.freeze({
  Electronic: 'E',
  Pit: 'P',
  ExPit: 'X',
  ClearingHouse: 'C',
  RegisteredMarket: 'R',
  OffMarket: 'O',
  CentralLimitOrderBook: 'B',
  QuoteDrivenMarket: 'Q',
  DarkOrderBook: 'D',
  AuctionDrivenMarket: 'A',
  QuoteNegotiation: 'N',
  VoiceNegotiation: 'V',
  HybridMarket: 'H',
  OtherMarket: 'z',
} as const);

/** `VerificationMethod` values (`FIX::VerificationMethod_*`). */
export const VerificationMethod = /* @__PURE__ */ Object.freeze({
  NonElectronic: '0',
  Electronic: '1',
} as const);

/** `WorkingIndicator` values (`FIX::WorkingIndicator_*`). */
export const WorkingIndicator = /* @__PURE__ */ Object.freeze({
  No: 'N',
  Yes: 'Y',
} as const);

/** `YieldType` values (`FIX::YieldType_*`). */
export const YieldType = /* @__PURE__ */ Object.freeze({
  TrueYield: 'TRUE',
  PreviousCloseYield: 'PREVCLOSE',
  YieldToLongestAverage: 'LONGEST',
  YieldToLongestAverageLife: 'LONGAVGLIFE',
  YieldToMaturity: 'MATURITY',
  MarkToMarketYield: 'MARK',
  OpenAverageYield: 'OPENAVG',
  YieldToNextPut: 'PUT',
  ProceedsYield: 'PROCEEDS',
  SemiAnnualYield: 'SEMIANNUAL',
  YieldToShortestAverageLife: 'SHORTAVGLIFE',
  YieldToShortestAverage: 'SHORTEST',
  SimpleYield: 'SIMPLE',
  YieldToTenderDate: 'TENDER',
  YieldValueOf32nds: 'VALUE1_32',
  YieldToWorst: 'WORST',
  TaxEquivalentYield: 'TAXEQUIV',
  AnnualYield: 'ANNUAL',
  ClosingYieldMostRecentYear: 'LASTYEAR',
  YieldToNextRefund: 'NEXTREFUND',
  AfterTaxYield: 'AFTERTAX',
  YieldAtIssue: 'ATISSUE',
  YieldToAverageLife: 'AVGLIFE',
  YieldToAverageMaturity: 'AVGMATURITY',
  BookYield: 'BOOK',
  YieldToNextCall: 'CALL',
  YieldChangeSinceClose: 'CHANGE',
  CompoundYield: 'COMPOUND',
  CurrentYield: 'CURRENT',
  TrueGrossYield: 'GROSS',
  GvntEquivalentYield: 'GOVTEQUIV',
  YieldWithInflationAssumption: 'INFLATION',
  InverseFloaterBondYield: 'INVERSEFLOATER',
  ClosingYieldMostRecentQuarter: 'LASTQUARTER',
  MostRecentClosingYield: 'LASTCLOSE',
  ClosingYieldMostRecentMonth: 'LASTMONTH',
  ClosingYield: 'CLOSE',
  Fix4nYieldValueOf32nds: 'VALUE1/32',
} as const);

/** The shape of {@link VALUES}: every value group keyed by field name. */
export interface ValueGroups {
  readonly AccountType: typeof AccountType;
  readonly AcctIDSource: typeof AcctIDSource;
  readonly Adjustment: typeof Adjustment;
  readonly AdjustmentType: typeof AdjustmentType;
  readonly AdvSide: typeof AdvSide;
  readonly AdvTransType: typeof AdvTransType;
  readonly AffirmStatus: typeof AffirmStatus;
  readonly AggregatedBook: typeof AggregatedBook;
  readonly AggressorIndicator: typeof AggressorIndicator;
  readonly AlgorithmicTradeIndicator: typeof AlgorithmicTradeIndicator;
  readonly AllocAccountType: typeof AllocAccountType;
  readonly AllocCancReplaceReason: typeof AllocCancReplaceReason;
  readonly AllocGroupStatus: typeof AllocGroupStatus;
  readonly AllocHandlInst: typeof AllocHandlInst;
  readonly AllocIntermedReqType: typeof AllocIntermedReqType;
  readonly AllocLinkType: typeof AllocLinkType;
  readonly AllocMethod: typeof AllocMethod;
  readonly AllocNoOrdersType: typeof AllocNoOrdersType;
  readonly AllocPositionEffect: typeof AllocPositionEffect;
  readonly AllocRejCode: typeof AllocRejCode;
  readonly AllocReportType: typeof AllocReportType;
  readonly AllocRequestStatus: typeof AllocRequestStatus;
  readonly AllocReversalStatus: typeof AllocReversalStatus;
  readonly AllocSettlInstType: typeof AllocSettlInstType;
  readonly AllocStatus: typeof AllocStatus;
  readonly AllocTransType: typeof AllocTransType;
  readonly AllocType: typeof AllocType;
  readonly AllocationRollupInstruction: typeof AllocationRollupInstruction;
  readonly ApplLevelRecoveryIndicator: typeof ApplLevelRecoveryIndicator;
  readonly ApplQueueAction: typeof ApplQueueAction;
  readonly ApplQueueResolution: typeof ApplQueueResolution;
  readonly ApplReportType: typeof ApplReportType;
  readonly ApplReqType: typeof ApplReqType;
  readonly ApplResponseError: typeof ApplResponseError;
  readonly ApplResponseType: typeof ApplResponseType;
  readonly ApplVerID: typeof ApplVerID;
  readonly AsOfIndicator: typeof AsOfIndicator;
  readonly AssetClass: typeof AssetClass;
  readonly AssetGroup: typeof AssetGroup;
  readonly AssetSubClass: typeof AssetSubClass;
  readonly AssignmentMethod: typeof AssignmentMethod;
  readonly AttachmentEncodingType: typeof AttachmentEncodingType;
  readonly AuctionInstruction: typeof AuctionInstruction;
  readonly AuctionType: typeof AuctionType;
  readonly AveragePriceType: typeof AveragePriceType;
  readonly AvgPxIndicator: typeof AvgPxIndicator;
  readonly BasisPxType: typeof BasisPxType;
  readonly BatchProcessMode: typeof BatchProcessMode;
  readonly Benchmark: typeof Benchmark;
  readonly BenchmarkCurveName: typeof BenchmarkCurveName;
  readonly BidDescriptorType: typeof BidDescriptorType;
  readonly BidRequestTransType: typeof BidRequestTransType;
  readonly BidTradeType: typeof BidTradeType;
  readonly BidType: typeof BidType;
  readonly BlockTrdAllocIndicator: typeof BlockTrdAllocIndicator;
  readonly BookingType: typeof BookingType;
  readonly BookingUnit: typeof BookingUnit;
  readonly BusinessDayConvention: typeof BusinessDayConvention;
  readonly BusinessRejectReason: typeof BusinessRejectReason;
  readonly CPProgram: typeof CPProgram;
  readonly CalculationMethod: typeof CalculationMethod;
  readonly CancellationRights: typeof CancellationRights;
  readonly CashMargin: typeof CashMargin;
  readonly CashSettlPriceDefault: typeof CashSettlPriceDefault;
  readonly CashSettlQuoteMethod: typeof CashSettlQuoteMethod;
  readonly CashSettlValuationMethod: typeof CashSettlValuationMethod;
  readonly ClearedIndicator: typeof ClearedIndicator;
  readonly ClearingAccountType: typeof ClearingAccountType;
  readonly ClearingFeeIndicator: typeof ClearingFeeIndicator;
  readonly ClearingInstruction: typeof ClearingInstruction;
  readonly ClearingIntention: typeof ClearingIntention;
  readonly ClearingRequirementException: typeof ClearingRequirementException;
  readonly CollAction: typeof CollAction;
  readonly CollApplType: typeof CollApplType;
  readonly CollAsgnReason: typeof CollAsgnReason;
  readonly CollAsgnRejectReason: typeof CollAsgnRejectReason;
  readonly CollAsgnRespType: typeof CollAsgnRespType;
  readonly CollAsgnTransType: typeof CollAsgnTransType;
  readonly CollInquiryQualifier: typeof CollInquiryQualifier;
  readonly CollInquiryResult: typeof CollInquiryResult;
  readonly CollInquiryStatus: typeof CollInquiryStatus;
  readonly CollRptRejectReason: typeof CollRptRejectReason;
  readonly CollRptStatus: typeof CollRptStatus;
  readonly CollStatus: typeof CollStatus;
  readonly CollateralAmountType: typeof CollateralAmountType;
  readonly CollateralReinvestmentType: typeof CollateralReinvestmentType;
  readonly CommType: typeof CommType;
  readonly CommissionAmountSubType: typeof CommissionAmountSubType;
  readonly CommissionAmountType: typeof CommissionAmountType;
  readonly CommodityFinalPriceType: typeof CommodityFinalPriceType;
  readonly ComplexEventCondition: typeof ComplexEventCondition;
  readonly ComplexEventCreditEventNotifyingParty: typeof ComplexEventCreditEventNotifyingParty;
  readonly ComplexEventDateOffsetDayType: typeof ComplexEventDateOffsetDayType;
  readonly ComplexEventPVFinalPriceElectionFallback: typeof ComplexEventPVFinalPriceElectionFallback;
  readonly ComplexEventPeriodType: typeof ComplexEventPeriodType;
  readonly ComplexEventPriceBoundaryMethod: typeof ComplexEventPriceBoundaryMethod;
  readonly ComplexEventPriceTimeType: typeof ComplexEventPriceTimeType;
  readonly ComplexEventQuoteBasis: typeof ComplexEventQuoteBasis;
  readonly ComplexEventType: typeof ComplexEventType;
  readonly ComplexOptPayoutTime: typeof ComplexOptPayoutTime;
  readonly ConfirmRejReason: typeof ConfirmRejReason;
  readonly ConfirmStatus: typeof ConfirmStatus;
  readonly ConfirmTransType: typeof ConfirmTransType;
  readonly ConfirmType: typeof ConfirmType;
  readonly ConfirmationMethod: typeof ConfirmationMethod;
  readonly ContAmtType: typeof ContAmtType;
  readonly ContingencyType: typeof ContingencyType;
  readonly ContractMultiplierUnit: typeof ContractMultiplierUnit;
  readonly ContractRefPosType: typeof ContractRefPosType;
  readonly CorporateAction: typeof CorporateAction;
  readonly CouponDayCount: typeof CouponDayCount;
  readonly CouponFrequencyUnit: typeof CouponFrequencyUnit;
  readonly CouponType: typeof CouponType;
  readonly CoveredOrUncovered: typeof CoveredOrUncovered;
  readonly CrossPrioritization: typeof CrossPrioritization;
  readonly CrossType: typeof CrossType;
  readonly CrossedIndicator: typeof CrossedIndicator;
  readonly CurrencyCodeSource: typeof CurrencyCodeSource;
  readonly CustOrderCapacity: typeof CustOrderCapacity;
  readonly CustOrderHandlingInst: typeof CustOrderHandlingInst;
  readonly CustomerOrFirm: typeof CustomerOrFirm;
  readonly CustomerPriority: typeof CustomerPriority;
  readonly CxlRejReason: typeof CxlRejReason;
  readonly CxlRejResponseTo: typeof CxlRejResponseTo;
  readonly CxlType: typeof CxlType;
  readonly DKReason: typeof DKReason;
  readonly DateRollConvention: typeof DateRollConvention;
  readonly DayBookingInst: typeof DayBookingInst;
  readonly DealingCapacity: typeof DealingCapacity;
  readonly DeleteReason: typeof DeleteReason;
  readonly DeliveryForm: typeof DeliveryForm;
  readonly DeliveryScheduleSettlDay: typeof DeliveryScheduleSettlDay;
  readonly DeliveryScheduleSettlFlowType: typeof DeliveryScheduleSettlFlowType;
  readonly DeliveryScheduleSettlHolidaysProcessingInstruction: typeof DeliveryScheduleSettlHolidaysProcessingInstruction;
  readonly DeliveryScheduleSettlTimeType: typeof DeliveryScheduleSettlTimeType;
  readonly DeliveryScheduleToleranceType: typeof DeliveryScheduleToleranceType;
  readonly DeliveryScheduleType: typeof DeliveryScheduleType;
  readonly DeliveryStreamDeliveryPointSource: typeof DeliveryStreamDeliveryPointSource;
  readonly DeliveryStreamDeliveryRestriction: typeof DeliveryStreamDeliveryRestriction;
  readonly DeliveryStreamElectingPartySide: typeof DeliveryStreamElectingPartySide;
  readonly DeliveryStreamTitleTransferCondition: typeof DeliveryStreamTitleTransferCondition;
  readonly DeliveryStreamToleranceOptionSide: typeof DeliveryStreamToleranceOptionSide;
  readonly DeliveryStreamType: typeof DeliveryStreamType;
  readonly DeliveryType: typeof DeliveryType;
  readonly DeskOrderHandlingInst: typeof DeskOrderHandlingInst;
  readonly DeskType: typeof DeskType;
  readonly DeskTypeSource: typeof DeskTypeSource;
  readonly DisclosureInstruction: typeof DisclosureInstruction;
  readonly DisclosureType: typeof DisclosureType;
  readonly DiscretionInst: typeof DiscretionInst;
  readonly DiscretionLimitType: typeof DiscretionLimitType;
  readonly DiscretionMoveType: typeof DiscretionMoveType;
  readonly DiscretionOffsetType: typeof DiscretionOffsetType;
  readonly DiscretionRoundDirection: typeof DiscretionRoundDirection;
  readonly DiscretionScope: typeof DiscretionScope;
  readonly DisplayMethod: typeof DisplayMethod;
  readonly DisplayWhen: typeof DisplayWhen;
  readonly DistribPaymentMethod: typeof DistribPaymentMethod;
  readonly DividendAmountType: typeof DividendAmountType;
  readonly DividendComposition: typeof DividendComposition;
  readonly DividendEntitlementEvent: typeof DividendEntitlementEvent;
  readonly DlvyInstType: typeof DlvyInstType;
  readonly DueToRelated: typeof DueToRelated;
  readonly DuplicateClOrdIDIndicator: typeof DuplicateClOrdIDIndicator;
  readonly EmailType: typeof EmailType;
  readonly EncryptMethod: typeof EncryptMethod;
  readonly EntitlementAttribDatatype: typeof EntitlementAttribDatatype;
  readonly EntitlementRequestResult: typeof EntitlementRequestResult;
  readonly EntitlementStatus: typeof EntitlementStatus;
  readonly EntitlementSubType: typeof EntitlementSubType;
  readonly EntitlementType: typeof EntitlementType;
  readonly EventInitiatorType: typeof EventInitiatorType;
  readonly EventTimeUnit: typeof EventTimeUnit;
  readonly EventType: typeof EventType;
  readonly ExDestination: typeof ExDestination;
  readonly ExDestinationIDSource: typeof ExDestinationIDSource;
  readonly ExDestinationType: typeof ExDestinationType;
  readonly ExchangeForPhysical: typeof ExchangeForPhysical;
  readonly ExecAckStatus: typeof ExecAckStatus;
  readonly ExecInst: typeof ExecInst;
  readonly ExecMethod: typeof ExecMethod;
  readonly ExecPriceType: typeof ExecPriceType;
  readonly ExecRestatementReason: typeof ExecRestatementReason;
  readonly ExecTransType: typeof ExecTransType;
  readonly ExecType: typeof ExecType;
  readonly ExecTypeReason: typeof ExecTypeReason;
  readonly ExerciseConfirmationMethod: typeof ExerciseConfirmationMethod;
  readonly ExerciseMethod: typeof ExerciseMethod;
  readonly ExerciseStyle: typeof ExerciseStyle;
  readonly ExpType: typeof ExpType;
  readonly ExpirationCycle: typeof ExpirationCycle;
  readonly ExpirationQtyType: typeof ExpirationQtyType;
  readonly ExtraordinaryEventAdjustmentMethod: typeof ExtraordinaryEventAdjustmentMethod;
  readonly FinancialStatus: typeof FinancialStatus;
  readonly FlowScheduleType: typeof FlowScheduleType;
  readonly ForexReq: typeof ForexReq;
  readonly FundRenewWaiv: typeof FundRenewWaiv;
  readonly FundingSource: typeof FundingSource;
  readonly FuturesValuationMethod: typeof FuturesValuationMethod;
  readonly GTBookingInst: typeof GTBookingInst;
  readonly GapFillFlag: typeof GapFillFlag;
  readonly HaltReasonChar: typeof HaltReasonChar;
  readonly HaltReasonInt: typeof HaltReasonInt;
  readonly HandlInst: typeof HandlInst;
  readonly IDSource: typeof IDSource;
  readonly IOINaturalFlag: typeof IOINaturalFlag;
  readonly IOIOthSvc: typeof IOIOthSvc;
  readonly IOIQltyInd: typeof IOIQltyInd;
  readonly IOIQty: typeof IOIQty;
  readonly IOIQualifier: typeof IOIQualifier;
  readonly IOIShares: typeof IOIShares;
  readonly IOITransType: typeof IOITransType;
  readonly IRSDirection: typeof IRSDirection;
  readonly ImpliedMarketIndicator: typeof ImpliedMarketIndicator;
  readonly InTheMoneyCondition: typeof InTheMoneyCondition;
  readonly InViewOfCommon: typeof InViewOfCommon;
  readonly IncTaxInd: typeof IncTaxInd;
  readonly IndividualAllocType: typeof IndividualAllocType;
  readonly InstrAttribType: typeof InstrAttribType;
  readonly InstrmtAssignmentMethod: typeof InstrmtAssignmentMethod;
  readonly InstrumentScopeOperator: typeof InstrumentScopeOperator;
  readonly LastCapacity: typeof LastCapacity;
  readonly LastFragment: typeof LastFragment;
  readonly LastLiquidityInd: typeof LastLiquidityInd;
  readonly LastRptRequested: typeof LastRptRequested;
  readonly LegSwapType: typeof LegSwapType;
  readonly LegalConfirm: typeof LegalConfirm;
  readonly LienSeniority: typeof LienSeniority;
  readonly LimitAmtType: typeof LimitAmtType;
  readonly LiquidityIndType: typeof LiquidityIndType;
  readonly ListExecInstType: typeof ListExecInstType;
  readonly ListMethod: typeof ListMethod;
  readonly ListOrderStatus: typeof ListOrderStatus;
  readonly ListRejectReason: typeof ListRejectReason;
  readonly ListStatusType: typeof ListStatusType;
  readonly ListUpdateAction: typeof ListUpdateAction;
  readonly LoanFacility: typeof LoanFacility;
  readonly LocateReqd: typeof LocateReqd;
  readonly LockType: typeof LockType;
  readonly LotType: typeof LotType;
  readonly MDBookType: typeof MDBookType;
  readonly MDEntryType: typeof MDEntryType;
  readonly MDImplicitDelete: typeof MDImplicitDelete;
  readonly MDOriginType: typeof MDOriginType;
  readonly MDQuoteType: typeof MDQuoteType;
  readonly MDReportEvent: typeof MDReportEvent;
  readonly MDReqRejReason: typeof MDReqRejReason;
  readonly MDSecSizeType: typeof MDSecSizeType;
  readonly MDStatisticIntervalType: typeof MDStatisticIntervalType;
  readonly MDStatisticRatioType: typeof MDStatisticRatioType;
  readonly MDStatisticRequestResult: typeof MDStatisticRequestResult;
  readonly MDStatisticScope: typeof MDStatisticScope;
  readonly MDStatisticScopeType: typeof MDStatisticScopeType;
  readonly MDStatisticStatus: typeof MDStatisticStatus;
  readonly MDStatisticSubScope: typeof MDStatisticSubScope;
  readonly MDStatisticType: typeof MDStatisticType;
  readonly MDStatisticValueType: typeof MDStatisticValueType;
  readonly MDUpdateAction: typeof MDUpdateAction;
  readonly MDUpdateType: typeof MDUpdateType;
  readonly MDValueTier: typeof MDValueTier;
  readonly MarginAmtType: typeof MarginAmtType;
  readonly MarginDirection: typeof MarginDirection;
  readonly MarginReqmtInqQualifier: typeof MarginReqmtInqQualifier;
  readonly MarginReqmtInqResult: typeof MarginReqmtInqResult;
  readonly MarginReqmtRptType: typeof MarginReqmtRptType;
  readonly MarketCondition: typeof MarketCondition;
  readonly MarketDisruptionFallbackProvision: typeof MarketDisruptionFallbackProvision;
  readonly MarketDisruptionFallbackUnderlierType: typeof MarketDisruptionFallbackUnderlierType;
  readonly MarketDisruptionProvision: typeof MarketDisruptionProvision;
  readonly MarketMakerActivity: typeof MarketMakerActivity;
  readonly MarketSegmentRelationship: typeof MarketSegmentRelationship;
  readonly MarketSegmentStatus: typeof MarketSegmentStatus;
  readonly MarketSegmentSubType: typeof MarketSegmentSubType;
  readonly MarketSegmentType: typeof MarketSegmentType;
  readonly MarketUpdateAction: typeof MarketUpdateAction;
  readonly MassActionReason: typeof MassActionReason;
  readonly MassActionRejectReason: typeof MassActionRejectReason;
  readonly MassActionResponse: typeof MassActionResponse;
  readonly MassActionScope: typeof MassActionScope;
  readonly MassActionType: typeof MassActionType;
  readonly MassCancelRejectReason: typeof MassCancelRejectReason;
  readonly MassCancelRequestType: typeof MassCancelRequestType;
  readonly MassCancelResponse: typeof MassCancelResponse;
  readonly MassOrderRequestResult: typeof MassOrderRequestResult;
  readonly MassOrderRequestStatus: typeof MassOrderRequestStatus;
  readonly MassStatusReqType: typeof MassStatusReqType;
  readonly MatchExceptionElementType: typeof MatchExceptionElementType;
  readonly MatchExceptionToleranceValueType: typeof MatchExceptionToleranceValueType;
  readonly MatchExceptionType: typeof MatchExceptionType;
  readonly MatchInst: typeof MatchInst;
  readonly MatchStatus: typeof MatchStatus;
  readonly MatchType: typeof MatchType;
  readonly MatchingDataPointIndicator: typeof MatchingDataPointIndicator;
  readonly MaturityMonthYearFormat: typeof MaturityMonthYearFormat;
  readonly MaturityMonthYearIncrementUnits: typeof MaturityMonthYearIncrementUnits;
  readonly MessageEncoding: typeof MessageEncoding;
  readonly MinQtyMethod: typeof MinQtyMethod;
  readonly MiscFeeBasis: typeof MiscFeeBasis;
  readonly MiscFeeQualifier: typeof MiscFeeQualifier;
  readonly MiscFeeType: typeof MiscFeeType;
  readonly ModelType: typeof ModelType;
  readonly MoneyLaunderingStatus: typeof MoneyLaunderingStatus;
  readonly MsgDirection: typeof MsgDirection;
  readonly MsgType: typeof MsgType;
  readonly MultiJurisdictionReportingIndicator: typeof MultiJurisdictionReportingIndicator;
  readonly MultiLegReportingType: typeof MultiLegReportingType;
  readonly MultiLegRptTypeReq: typeof MultiLegRptTypeReq;
  readonly MultilegModel: typeof MultilegModel;
  readonly MultilegPriceMethod: typeof MultilegPriceMethod;
  readonly NBBOEntryType: typeof NBBOEntryType;
  readonly NBBOSource: typeof NBBOSource;
  readonly NegotiationMethod: typeof NegotiationMethod;
  readonly NetGrossInd: typeof NetGrossInd;
  readonly NetworkRequestType: typeof NetworkRequestType;
  readonly NetworkStatusResponseType: typeof NetworkStatusResponseType;
  readonly NewsCategory: typeof NewsCategory;
  readonly NewsRefType: typeof NewsRefType;
  readonly NoSides: typeof NoSides;
  readonly NonCashDividendTreatment: typeof NonCashDividendTreatment;
  readonly NonDeliverableFixingDateType: typeof NonDeliverableFixingDateType;
  readonly NotAffectedReason: typeof NotAffectedReason;
  readonly NotifyBrokerOfCredit: typeof NotifyBrokerOfCredit;
  readonly ObligationType: typeof ObligationType;
  readonly OddLot: typeof OddLot;
  readonly OffsetInstruction: typeof OffsetInstruction;
  readonly OffshoreIndicator: typeof OffshoreIndicator;
  readonly OpenClose: typeof OpenClose;
  readonly OpenCloseSettlFlag: typeof OpenCloseSettlFlag;
  readonly OpenCloseSettleFlag: typeof OpenCloseSettleFlag;
  readonly OptPayoutType: typeof OptPayoutType;
  readonly OptionExerciseDateType: typeof OptionExerciseDateType;
  readonly OrdRejReason: typeof OrdRejReason;
  readonly OrdStatus: typeof OrdStatus;
  readonly OrdType: typeof OrdType;
  readonly OrderAttributeType: typeof OrderAttributeType;
  readonly OrderCapacity: typeof OrderCapacity;
  readonly OrderCategory: typeof OrderCategory;
  readonly OrderDelayUnit: typeof OrderDelayUnit;
  readonly OrderEntryAction: typeof OrderEntryAction;
  readonly OrderEventReason: typeof OrderEventReason;
  readonly OrderEventType: typeof OrderEventType;
  readonly OrderHandlingInstSource: typeof OrderHandlingInstSource;
  readonly OrderOrigination: typeof OrderOrigination;
  readonly OrderOwnershipIndicator: typeof OrderOwnershipIndicator;
  readonly OrderRelationship: typeof OrderRelationship;
  readonly OrderResponseLevel: typeof OrderResponseLevel;
  readonly OrderRestrictions: typeof OrderRestrictions;
  readonly OrigCustOrderCapacity: typeof OrigCustOrderCapacity;
  readonly OwnerType: typeof OwnerType;
  readonly OwnershipType: typeof OwnershipType;
  readonly PartyActionRejectReason: typeof PartyActionRejectReason;
  readonly PartyActionResponse: typeof PartyActionResponse;
  readonly PartyActionType: typeof PartyActionType;
  readonly PartyDetailDefinitionStatus: typeof PartyDetailDefinitionStatus;
  readonly PartyDetailRequestResult: typeof PartyDetailRequestResult;
  readonly PartyDetailRequestStatus: typeof PartyDetailRequestStatus;
  readonly PartyDetailRoleQualifier: typeof PartyDetailRoleQualifier;
  readonly PartyDetailStatus: typeof PartyDetailStatus;
  readonly PartyIDSource: typeof PartyIDSource;
  readonly PartyRelationship: typeof PartyRelationship;
  readonly PartyRiskLimitStatus: typeof PartyRiskLimitStatus;
  readonly PartyRole: typeof PartyRole;
  readonly PartySubIDType: typeof PartySubIDType;
  readonly PayReportStatus: typeof PayReportStatus;
  readonly PayReportTransType: typeof PayReportTransType;
  readonly PayRequestStatus: typeof PayRequestStatus;
  readonly PayRequestTransType: typeof PayRequestTransType;
  readonly PaymentDateOffsetDayType: typeof PaymentDateOffsetDayType;
  readonly PaymentForwardStartType: typeof PaymentForwardStartType;
  readonly PaymentMethod: typeof PaymentMethod;
  readonly PaymentPaySide: typeof PaymentPaySide;
  readonly PaymentScheduleStepRelativeTo: typeof PaymentScheduleStepRelativeTo;
  readonly PaymentScheduleType: typeof PaymentScheduleType;
  readonly PaymentSettlStyle: typeof PaymentSettlStyle;
  readonly PaymentStreamAveragingMethod: typeof PaymentStreamAveragingMethod;
  readonly PaymentStreamCapRateBuySide: typeof PaymentStreamCapRateBuySide;
  readonly PaymentStreamCompoundingMethod: typeof PaymentStreamCompoundingMethod;
  readonly PaymentStreamDiscountType: typeof PaymentStreamDiscountType;
  readonly PaymentStreamFRADiscounting: typeof PaymentStreamFRADiscounting;
  readonly PaymentStreamFloorRateBuySide: typeof PaymentStreamFloorRateBuySide;
  readonly PaymentStreamInflationInterpolationMethod: typeof PaymentStreamInflationInterpolationMethod;
  readonly PaymentStreamInflationLagDayType: typeof PaymentStreamInflationLagDayType;
  readonly PaymentStreamInflationLagUnit: typeof PaymentStreamInflationLagUnit;
  readonly PaymentStreamInterpolationPeriod: typeof PaymentStreamInterpolationPeriod;
  readonly PaymentStreamLinkStrikePriceType: typeof PaymentStreamLinkStrikePriceType;
  readonly PaymentStreamNegativeRateTreatment: typeof PaymentStreamNegativeRateTreatment;
  readonly PaymentStreamPaymentDateOffsetDayType: typeof PaymentStreamPaymentDateOffsetDayType;
  readonly PaymentStreamPaymentDateOffsetUnit: typeof PaymentStreamPaymentDateOffsetUnit;
  readonly PaymentStreamPaymentFrequencyUnit: typeof PaymentStreamPaymentFrequencyUnit;
  readonly PaymentStreamPricingDayDistribution: typeof PaymentStreamPricingDayDistribution;
  readonly PaymentStreamPricingDayOfWeek: typeof PaymentStreamPricingDayOfWeek;
  readonly PaymentStreamRateIndexCurveUnit: typeof PaymentStreamRateIndexCurveUnit;
  readonly PaymentStreamRateIndexSource: typeof PaymentStreamRateIndexSource;
  readonly PaymentStreamRateSpreadPositionType: typeof PaymentStreamRateSpreadPositionType;
  readonly PaymentStreamRateSpreadType: typeof PaymentStreamRateSpreadType;
  readonly PaymentStreamRateTreatment: typeof PaymentStreamRateTreatment;
  readonly PaymentStreamRealizedVarianceMethod: typeof PaymentStreamRealizedVarianceMethod;
  readonly PaymentStreamResetWeeklyRollConvention: typeof PaymentStreamResetWeeklyRollConvention;
  readonly PaymentStreamSettlLevel: typeof PaymentStreamSettlLevel;
  readonly PaymentStreamType: typeof PaymentStreamType;
  readonly PaymentStubLength: typeof PaymentStubLength;
  readonly PaymentStubType: typeof PaymentStubType;
  readonly PaymentSubType: typeof PaymentSubType;
  readonly PaymentType: typeof PaymentType;
  readonly PegLimitType: typeof PegLimitType;
  readonly PegMoveType: typeof PegMoveType;
  readonly PegOffsetType: typeof PegOffsetType;
  readonly PegPriceType: typeof PegPriceType;
  readonly PegRoundDirection: typeof PegRoundDirection;
  readonly PegScope: typeof PegScope;
  readonly PosAmtReason: typeof PosAmtReason;
  readonly PosAmtType: typeof PosAmtType;
  readonly PosMaintAction: typeof PosMaintAction;
  readonly PosMaintResult: typeof PosMaintResult;
  readonly PosMaintStatus: typeof PosMaintStatus;
  readonly PosQtyStatus: typeof PosQtyStatus;
  readonly PosReqResult: typeof PosReqResult;
  readonly PosReqStatus: typeof PosReqStatus;
  readonly PosReqType: typeof PosReqType;
  readonly PosTransType: typeof PosTransType;
  readonly PosType: typeof PosType;
  readonly PositionCapacity: typeof PositionCapacity;
  readonly PositionEffect: typeof PositionEffect;
  readonly PossDupFlag: typeof PossDupFlag;
  readonly PossResend: typeof PossResend;
  readonly PostTradePaymentDebitOrCredit: typeof PostTradePaymentDebitOrCredit;
  readonly PostTradePaymentStatus: typeof PostTradePaymentStatus;
  readonly PreallocMethod: typeof PreallocMethod;
  readonly PreviouslyReported: typeof PreviouslyReported;
  readonly PriceLimitType: typeof PriceLimitType;
  readonly PriceMovementType: typeof PriceMovementType;
  readonly PriceProtectionScope: typeof PriceProtectionScope;
  readonly PriceQualifier: typeof PriceQualifier;
  readonly PriceQuoteMethod: typeof PriceQuoteMethod;
  readonly PriceType: typeof PriceType;
  readonly PriorityIndicator: typeof PriorityIndicator;
  readonly PrivateQuote: typeof PrivateQuote;
  readonly ProcessCode: typeof ProcessCode;
  readonly Product: typeof Product;
  readonly ProgRptReqs: typeof ProgRptReqs;
  readonly ProtectionTermEventDayType: typeof ProtectionTermEventDayType;
  readonly ProtectionTermEventQualifier: typeof ProtectionTermEventQualifier;
  readonly ProtectionTermEventUnit: typeof ProtectionTermEventUnit;
  readonly ProvisionBreakFeeElection: typeof ProvisionBreakFeeElection;
  readonly ProvisionCalculationAgent: typeof ProvisionCalculationAgent;
  readonly ProvisionCashSettlMethod: typeof ProvisionCashSettlMethod;
  readonly ProvisionCashSettlPaymentDateType: typeof ProvisionCashSettlPaymentDateType;
  readonly ProvisionCashSettlQuoteType: typeof ProvisionCashSettlQuoteType;
  readonly ProvisionDateTenorUnit: typeof ProvisionDateTenorUnit;
  readonly ProvisionOptionExerciseEarliestDateOffsetUnit: typeof ProvisionOptionExerciseEarliestDateOffsetUnit;
  readonly ProvisionOptionExerciseFixedDateType: typeof ProvisionOptionExerciseFixedDateType;
  readonly ProvisionOptionSinglePartyBuyerSide: typeof ProvisionOptionSinglePartyBuyerSide;
  readonly ProvisionType: typeof ProvisionType;
  readonly PublishTrdIndicator: typeof PublishTrdIndicator;
  readonly PutOrCall: typeof PutOrCall;
  readonly QtyType: typeof QtyType;
  readonly QuantityType: typeof QuantityType;
  readonly QuoteAckStatus: typeof QuoteAckStatus;
  readonly QuoteAttributeType: typeof QuoteAttributeType;
  readonly QuoteCancelType: typeof QuoteCancelType;
  readonly QuoteCondition: typeof QuoteCondition;
  readonly QuoteEntryRejectReason: typeof QuoteEntryRejectReason;
  readonly QuoteEntryStatus: typeof QuoteEntryStatus;
  readonly QuoteModelType: typeof QuoteModelType;
  readonly QuotePriceType: typeof QuotePriceType;
  readonly QuoteRejectReason: typeof QuoteRejectReason;
  readonly QuoteRequestRejectReason: typeof QuoteRequestRejectReason;
  readonly QuoteRequestType: typeof QuoteRequestType;
  readonly QuoteRespType: typeof QuoteRespType;
  readonly QuoteResponseLevel: typeof QuoteResponseLevel;
  readonly QuoteSideIndicator: typeof QuoteSideIndicator;
  readonly QuoteStatus: typeof QuoteStatus;
  readonly QuoteType: typeof QuoteType;
  readonly RateSource: typeof RateSource;
  readonly RateSourceType: typeof RateSourceType;
  readonly RefOrdIDReason: typeof RefOrdIDReason;
  readonly RefOrderIDSource: typeof RefOrderIDSource;
  readonly RefRiskLimitCheckIDType: typeof RefRiskLimitCheckIDType;
  readonly ReferenceDataDateType: typeof ReferenceDataDateType;
  readonly ReferenceEntityType: typeof ReferenceEntityType;
  readonly RegistRejReasonCode: typeof RegistRejReasonCode;
  readonly RegistStatus: typeof RegistStatus;
  readonly RegistTransType: typeof RegistTransType;
  readonly RegulatoryReportType: typeof RegulatoryReportType;
  readonly RegulatoryTradeIDEvent: typeof RegulatoryTradeIDEvent;
  readonly RegulatoryTradeIDScope: typeof RegulatoryTradeIDScope;
  readonly RegulatoryTradeIDSource: typeof RegulatoryTradeIDSource;
  readonly RegulatoryTradeIDType: typeof RegulatoryTradeIDType;
  readonly RegulatoryTransactionType: typeof RegulatoryTransactionType;
  readonly RelatedInstrumentType: typeof RelatedInstrumentType;
  readonly RelatedOrderIDSource: typeof RelatedOrderIDSource;
  readonly RelatedPositionIDSource: typeof RelatedPositionIDSource;
  readonly RelatedPriceSource: typeof RelatedPriceSource;
  readonly RelatedTradeIDSource: typeof RelatedTradeIDSource;
  readonly RelativeValueSide: typeof RelativeValueSide;
  readonly RelativeValueType: typeof RelativeValueType;
  readonly ReleaseInstruction: typeof ReleaseInstruction;
  readonly RemunerationIndicator: typeof RemunerationIndicator;
  readonly ReportToExch: typeof ReportToExch;
  readonly RequestResult: typeof RequestResult;
  readonly ResetSeqNumFlag: typeof ResetSeqNumFlag;
  readonly RespondentType: typeof RespondentType;
  readonly ResponseTransportType: typeof ResponseTransportType;
  readonly RestructuringType: typeof RestructuringType;
  readonly ReturnRateDateMode: typeof ReturnRateDateMode;
  readonly ReturnRatePriceBasis: typeof ReturnRatePriceBasis;
  readonly ReturnRatePriceSequence: typeof ReturnRatePriceSequence;
  readonly ReturnRatePriceType: typeof ReturnRatePriceType;
  readonly ReturnRateQuoteTimeType: typeof ReturnRateQuoteTimeType;
  readonly ReturnRateValuationPriceOption: typeof ReturnRateValuationPriceOption;
  readonly ReturnTrigger: typeof ReturnTrigger;
  readonly RiskLimitAction: typeof RiskLimitAction;
  readonly RiskLimitCheckModelType: typeof RiskLimitCheckModelType;
  readonly RiskLimitCheckRequestResult: typeof RiskLimitCheckRequestResult;
  readonly RiskLimitCheckRequestStatus: typeof RiskLimitCheckRequestStatus;
  readonly RiskLimitCheckRequestType: typeof RiskLimitCheckRequestType;
  readonly RiskLimitCheckStatus: typeof RiskLimitCheckStatus;
  readonly RiskLimitCheckTransType: typeof RiskLimitCheckTransType;
  readonly RiskLimitCheckType: typeof RiskLimitCheckType;
  readonly RiskLimitReportRejectReason: typeof RiskLimitReportRejectReason;
  readonly RiskLimitReportStatus: typeof RiskLimitReportStatus;
  readonly RiskLimitRequestResult: typeof RiskLimitRequestResult;
  readonly RiskLimitRequestType: typeof RiskLimitRequestType;
  readonly RiskLimitType: typeof RiskLimitType;
  readonly RoundingDirection: typeof RoundingDirection;
  readonly RoutingArrangmentIndicator: typeof RoutingArrangmentIndicator;
  readonly RoutingType: typeof RoutingType;
  readonly Rule80A: typeof Rule80A;
  readonly Scope: typeof Scope;
  readonly SecurityClassificationReason: typeof SecurityClassificationReason;
  readonly SecurityIDSource: typeof SecurityIDSource;
  readonly SecurityListRequestType: typeof SecurityListRequestType;
  readonly SecurityListType: typeof SecurityListType;
  readonly SecurityListTypeSource: typeof SecurityListTypeSource;
  readonly SecurityRejectReason: typeof SecurityRejectReason;
  readonly SecurityRequestResult: typeof SecurityRequestResult;
  readonly SecurityRequestType: typeof SecurityRequestType;
  readonly SecurityResponseType: typeof SecurityResponseType;
  readonly SecurityStatus: typeof SecurityStatus;
  readonly SecurityTradingEvent: typeof SecurityTradingEvent;
  readonly SecurityTradingStatus: typeof SecurityTradingStatus;
  readonly SecurityType: typeof SecurityType;
  readonly SecurityUpdateAction: typeof SecurityUpdateAction;
  readonly SelfMatchPreventionInstruction: typeof SelfMatchPreventionInstruction;
  readonly Seniority: typeof Seniority;
  readonly SessionRejectReason: typeof SessionRejectReason;
  readonly SessionStatus: typeof SessionStatus;
  readonly SettlCurrFxRateCalc: typeof SettlCurrFxRateCalc;
  readonly SettlDeliveryType: typeof SettlDeliveryType;
  readonly SettlDisruptionProvision: typeof SettlDisruptionProvision;
  readonly SettlInstMode: typeof SettlInstMode;
  readonly SettlInstReqRejCode: typeof SettlInstReqRejCode;
  readonly SettlInstSource: typeof SettlInstSource;
  readonly SettlInstTransType: typeof SettlInstTransType;
  readonly SettlLocation: typeof SettlLocation;
  readonly SettlMethod: typeof SettlMethod;
  readonly SettlObligMode: typeof SettlObligMode;
  readonly SettlObligSource: typeof SettlObligSource;
  readonly SettlObligTransType: typeof SettlObligTransType;
  readonly SettlPriceType: typeof SettlPriceType;
  readonly SettlSessID: typeof SettlSessID;
  readonly SettlSubMethod: typeof SettlSubMethod;
  readonly SettlType: typeof SettlType;
  readonly SettlmntTyp: typeof SettlmntTyp;
  readonly ShortSaleExemptionReason: typeof ShortSaleExemptionReason;
  readonly ShortSaleReason: typeof ShortSaleReason;
  readonly ShortSaleRestriction: typeof ShortSaleRestriction;
  readonly Side: typeof Side;
  readonly SideAvgPxIndicator: typeof SideAvgPxIndicator;
  readonly SideClearingTradePriceType: typeof SideClearingTradePriceType;
  readonly SideMultiLegReportingType: typeof SideMultiLegReportingType;
  readonly SideValueInd: typeof SideValueInd;
  readonly SingleQuoteIndicator: typeof SingleQuoteIndicator;
  readonly SolicitedFlag: typeof SolicitedFlag;
  readonly StandInstDbType: typeof StandInstDbType;
  readonly StatsType: typeof StatsType;
  readonly StatusValue: typeof StatusValue;
  readonly StipulationType: typeof StipulationType;
  readonly StrategyParameterType: typeof StrategyParameterType;
  readonly StrategyType: typeof StrategyType;
  readonly StreamAsgnAckType: typeof StreamAsgnAckType;
  readonly StreamAsgnRejReason: typeof StreamAsgnRejReason;
  readonly StreamAsgnReqType: typeof StreamAsgnReqType;
  readonly StreamAsgnType: typeof StreamAsgnType;
  readonly StreamCommodityDataSourceIDType: typeof StreamCommodityDataSourceIDType;
  readonly StreamCommodityNearbySettlDayUnit: typeof StreamCommodityNearbySettlDayUnit;
  readonly StreamCommoditySettlDateRollUnit: typeof StreamCommoditySettlDateRollUnit;
  readonly StreamNotionalAdjustments: typeof StreamNotionalAdjustments;
  readonly StreamNotionalCommodityFrequency: typeof StreamNotionalCommodityFrequency;
  readonly StreamType: typeof StreamType;
  readonly StrikeIndexQuote: typeof StrikeIndexQuote;
  readonly StrikePriceBoundaryMethod: typeof StrikePriceBoundaryMethod;
  readonly StrikePriceDeterminationMethod: typeof StrikePriceDeterminationMethod;
  readonly SubscriptionRequestType: typeof SubscriptionRequestType;
  readonly SwapClass: typeof SwapClass;
  readonly SwapSubClass: typeof SwapSubClass;
  readonly SymbolSfx: typeof SymbolSfx;
  readonly TargetStrategy: typeof TargetStrategy;
  readonly TaxAdvantageType: typeof TaxAdvantageType;
  readonly TaxonomyType: typeof TaxonomyType;
  readonly TerminationType: typeof TerminationType;
  readonly TestMessageIndicator: typeof TestMessageIndicator;
  readonly ThrottleAction: typeof ThrottleAction;
  readonly ThrottleCountIndicator: typeof ThrottleCountIndicator;
  readonly ThrottleInst: typeof ThrottleInst;
  readonly ThrottleStatus: typeof ThrottleStatus;
  readonly ThrottleType: typeof ThrottleType;
  readonly TickDirection: typeof TickDirection;
  readonly TickRuleType: typeof TickRuleType;
  readonly TimeInForce: typeof TimeInForce;
  readonly TimeUnit: typeof TimeUnit;
  readonly TradSesControl: typeof TradSesControl;
  readonly TradSesEvent: typeof TradSesEvent;
  readonly TradSesMethod: typeof TradSesMethod;
  readonly TradSesMode: typeof TradSesMode;
  readonly TradSesStatus: typeof TradSesStatus;
  readonly TradSesStatusRejReason: typeof TradSesStatusRejReason;
  readonly TradeAggregationRejectReason: typeof TradeAggregationRejectReason;
  readonly TradeAggregationRequestStatus: typeof TradeAggregationRequestStatus;
  readonly TradeAggregationTransType: typeof TradeAggregationTransType;
  readonly TradeAllocGroupInstruction: typeof TradeAllocGroupInstruction;
  readonly TradeAllocIndicator: typeof TradeAllocIndicator;
  readonly TradeAllocStatus: typeof TradeAllocStatus;
  readonly TradeCollateralization: typeof TradeCollateralization;
  readonly TradeCondition: typeof TradeCondition;
  readonly TradeContingency: typeof TradeContingency;
  readonly TradeContinuation: typeof TradeContinuation;
  readonly TradeHandlingInstr: typeof TradeHandlingInstr;
  readonly TradeMatchAckStatus: typeof TradeMatchAckStatus;
  readonly TradeMatchRejectReason: typeof TradeMatchRejectReason;
  readonly TradePriceCondition: typeof TradePriceCondition;
  readonly TradePriceNegotiationMethod: typeof TradePriceNegotiationMethod;
  readonly TradePublishIndicator: typeof TradePublishIndicator;
  readonly TradeQtyType: typeof TradeQtyType;
  readonly TradeReportRejectReason: typeof TradeReportRejectReason;
  readonly TradeReportTransType: typeof TradeReportTransType;
  readonly TradeReportType: typeof TradeReportType;
  readonly TradeReportingIndicator: typeof TradeReportingIndicator;
  readonly TradeRequestResult: typeof TradeRequestResult;
  readonly TradeRequestStatus: typeof TradeRequestStatus;
  readonly TradeRequestType: typeof TradeRequestType;
  readonly TradeType: typeof TradeType;
  readonly TradeVolType: typeof TradeVolType;
  readonly TradedFlatSwitch: typeof TradedFlatSwitch;
  readonly TradingCapacity: typeof TradingCapacity;
  readonly TradingSessionID: typeof TradingSessionID;
  readonly TradingSessionSubID: typeof TradingSessionSubID;
  readonly TransactionAttributeType: typeof TransactionAttributeType;
  readonly TransferRejectReason: typeof TransferRejectReason;
  readonly TransferReportType: typeof TransferReportType;
  readonly TransferScope: typeof TransferScope;
  readonly TransferStatus: typeof TransferStatus;
  readonly TransferTransType: typeof TransferTransType;
  readonly TransferType: typeof TransferType;
  readonly TrdAckStatus: typeof TrdAckStatus;
  readonly TrdRegPublicationReason: typeof TrdRegPublicationReason;
  readonly TrdRegPublicationType: typeof TrdRegPublicationType;
  readonly TrdRegTimestampManualIndicator: typeof TrdRegTimestampManualIndicator;
  readonly TrdRegTimestampType: typeof TrdRegTimestampType;
  readonly TrdRptStatus: typeof TrdRptStatus;
  readonly TrdSubType: typeof TrdSubType;
  readonly TrdType: typeof TrdType;
  readonly TriggerAction: typeof TriggerAction;
  readonly TriggerOrderType: typeof TriggerOrderType;
  readonly TriggerPriceDirection: typeof TriggerPriceDirection;
  readonly TriggerPriceType: typeof TriggerPriceType;
  readonly TriggerPriceTypeScope: typeof TriggerPriceTypeScope;
  readonly TriggerScope: typeof TriggerScope;
  readonly TriggerType: typeof TriggerType;
  readonly Triggered: typeof Triggered;
  readonly UnderlyingCashType: typeof UnderlyingCashType;
  readonly UnderlyingFXRateCalc: typeof UnderlyingFXRateCalc;
  readonly UnderlyingNotionalAdjustments: typeof UnderlyingNotionalAdjustments;
  readonly UnderlyingObligationType: typeof UnderlyingObligationType;
  readonly UnderlyingPriceDeterminationMethod: typeof UnderlyingPriceDeterminationMethod;
  readonly UnderlyingSettlementType: typeof UnderlyingSettlementType;
  readonly UnitOfMeasure: typeof UnitOfMeasure;
  readonly UnitofMeasure: typeof UnitofMeasure;
  readonly UnsolicitedIndicator: typeof UnsolicitedIndicator;
  readonly UpfrontPriceType: typeof UpfrontPriceType;
  readonly Urgency: typeof Urgency;
  readonly UserRequestType: typeof UserRequestType;
  readonly UserStatus: typeof UserStatus;
  readonly ValuationMethod: typeof ValuationMethod;
  readonly ValueCheckAction: typeof ValueCheckAction;
  readonly ValueCheckType: typeof ValueCheckType;
  readonly VenueType: typeof VenueType;
  readonly VerificationMethod: typeof VerificationMethod;
  readonly WorkingIndicator: typeof WorkingIndicator;
  readonly YieldType: typeof YieldType;
}

/** Every value group keyed by field name, e.g. `VALUES.Side.Buy === '1'`. */
export const VALUES: ValueGroups = /* @__PURE__ */ Object.freeze({
  AccountType,
  AcctIDSource,
  Adjustment,
  AdjustmentType,
  AdvSide,
  AdvTransType,
  AffirmStatus,
  AggregatedBook,
  AggressorIndicator,
  AlgorithmicTradeIndicator,
  AllocAccountType,
  AllocCancReplaceReason,
  AllocGroupStatus,
  AllocHandlInst,
  AllocIntermedReqType,
  AllocLinkType,
  AllocMethod,
  AllocNoOrdersType,
  AllocPositionEffect,
  AllocRejCode,
  AllocReportType,
  AllocRequestStatus,
  AllocReversalStatus,
  AllocSettlInstType,
  AllocStatus,
  AllocTransType,
  AllocType,
  AllocationRollupInstruction,
  ApplLevelRecoveryIndicator,
  ApplQueueAction,
  ApplQueueResolution,
  ApplReportType,
  ApplReqType,
  ApplResponseError,
  ApplResponseType,
  ApplVerID,
  AsOfIndicator,
  AssetClass,
  AssetGroup,
  AssetSubClass,
  AssignmentMethod,
  AttachmentEncodingType,
  AuctionInstruction,
  AuctionType,
  AveragePriceType,
  AvgPxIndicator,
  BasisPxType,
  BatchProcessMode,
  Benchmark,
  BenchmarkCurveName,
  BidDescriptorType,
  BidRequestTransType,
  BidTradeType,
  BidType,
  BlockTrdAllocIndicator,
  BookingType,
  BookingUnit,
  BusinessDayConvention,
  BusinessRejectReason,
  CPProgram,
  CalculationMethod,
  CancellationRights,
  CashMargin,
  CashSettlPriceDefault,
  CashSettlQuoteMethod,
  CashSettlValuationMethod,
  ClearedIndicator,
  ClearingAccountType,
  ClearingFeeIndicator,
  ClearingInstruction,
  ClearingIntention,
  ClearingRequirementException,
  CollAction,
  CollApplType,
  CollAsgnReason,
  CollAsgnRejectReason,
  CollAsgnRespType,
  CollAsgnTransType,
  CollInquiryQualifier,
  CollInquiryResult,
  CollInquiryStatus,
  CollRptRejectReason,
  CollRptStatus,
  CollStatus,
  CollateralAmountType,
  CollateralReinvestmentType,
  CommType,
  CommissionAmountSubType,
  CommissionAmountType,
  CommodityFinalPriceType,
  ComplexEventCondition,
  ComplexEventCreditEventNotifyingParty,
  ComplexEventDateOffsetDayType,
  ComplexEventPVFinalPriceElectionFallback,
  ComplexEventPeriodType,
  ComplexEventPriceBoundaryMethod,
  ComplexEventPriceTimeType,
  ComplexEventQuoteBasis,
  ComplexEventType,
  ComplexOptPayoutTime,
  ConfirmRejReason,
  ConfirmStatus,
  ConfirmTransType,
  ConfirmType,
  ConfirmationMethod,
  ContAmtType,
  ContingencyType,
  ContractMultiplierUnit,
  ContractRefPosType,
  CorporateAction,
  CouponDayCount,
  CouponFrequencyUnit,
  CouponType,
  CoveredOrUncovered,
  CrossPrioritization,
  CrossType,
  CrossedIndicator,
  CurrencyCodeSource,
  CustOrderCapacity,
  CustOrderHandlingInst,
  CustomerOrFirm,
  CustomerPriority,
  CxlRejReason,
  CxlRejResponseTo,
  CxlType,
  DKReason,
  DateRollConvention,
  DayBookingInst,
  DealingCapacity,
  DeleteReason,
  DeliveryForm,
  DeliveryScheduleSettlDay,
  DeliveryScheduleSettlFlowType,
  DeliveryScheduleSettlHolidaysProcessingInstruction,
  DeliveryScheduleSettlTimeType,
  DeliveryScheduleToleranceType,
  DeliveryScheduleType,
  DeliveryStreamDeliveryPointSource,
  DeliveryStreamDeliveryRestriction,
  DeliveryStreamElectingPartySide,
  DeliveryStreamTitleTransferCondition,
  DeliveryStreamToleranceOptionSide,
  DeliveryStreamType,
  DeliveryType,
  DeskOrderHandlingInst,
  DeskType,
  DeskTypeSource,
  DisclosureInstruction,
  DisclosureType,
  DiscretionInst,
  DiscretionLimitType,
  DiscretionMoveType,
  DiscretionOffsetType,
  DiscretionRoundDirection,
  DiscretionScope,
  DisplayMethod,
  DisplayWhen,
  DistribPaymentMethod,
  DividendAmountType,
  DividendComposition,
  DividendEntitlementEvent,
  DlvyInstType,
  DueToRelated,
  DuplicateClOrdIDIndicator,
  EmailType,
  EncryptMethod,
  EntitlementAttribDatatype,
  EntitlementRequestResult,
  EntitlementStatus,
  EntitlementSubType,
  EntitlementType,
  EventInitiatorType,
  EventTimeUnit,
  EventType,
  ExDestination,
  ExDestinationIDSource,
  ExDestinationType,
  ExchangeForPhysical,
  ExecAckStatus,
  ExecInst,
  ExecMethod,
  ExecPriceType,
  ExecRestatementReason,
  ExecTransType,
  ExecType,
  ExecTypeReason,
  ExerciseConfirmationMethod,
  ExerciseMethod,
  ExerciseStyle,
  ExpType,
  ExpirationCycle,
  ExpirationQtyType,
  ExtraordinaryEventAdjustmentMethod,
  FinancialStatus,
  FlowScheduleType,
  ForexReq,
  FundRenewWaiv,
  FundingSource,
  FuturesValuationMethod,
  GTBookingInst,
  GapFillFlag,
  HaltReasonChar,
  HaltReasonInt,
  HandlInst,
  IDSource,
  IOINaturalFlag,
  IOIOthSvc,
  IOIQltyInd,
  IOIQty,
  IOIQualifier,
  IOIShares,
  IOITransType,
  IRSDirection,
  ImpliedMarketIndicator,
  InTheMoneyCondition,
  InViewOfCommon,
  IncTaxInd,
  IndividualAllocType,
  InstrAttribType,
  InstrmtAssignmentMethod,
  InstrumentScopeOperator,
  LastCapacity,
  LastFragment,
  LastLiquidityInd,
  LastRptRequested,
  LegSwapType,
  LegalConfirm,
  LienSeniority,
  LimitAmtType,
  LiquidityIndType,
  ListExecInstType,
  ListMethod,
  ListOrderStatus,
  ListRejectReason,
  ListStatusType,
  ListUpdateAction,
  LoanFacility,
  LocateReqd,
  LockType,
  LotType,
  MDBookType,
  MDEntryType,
  MDImplicitDelete,
  MDOriginType,
  MDQuoteType,
  MDReportEvent,
  MDReqRejReason,
  MDSecSizeType,
  MDStatisticIntervalType,
  MDStatisticRatioType,
  MDStatisticRequestResult,
  MDStatisticScope,
  MDStatisticScopeType,
  MDStatisticStatus,
  MDStatisticSubScope,
  MDStatisticType,
  MDStatisticValueType,
  MDUpdateAction,
  MDUpdateType,
  MDValueTier,
  MarginAmtType,
  MarginDirection,
  MarginReqmtInqQualifier,
  MarginReqmtInqResult,
  MarginReqmtRptType,
  MarketCondition,
  MarketDisruptionFallbackProvision,
  MarketDisruptionFallbackUnderlierType,
  MarketDisruptionProvision,
  MarketMakerActivity,
  MarketSegmentRelationship,
  MarketSegmentStatus,
  MarketSegmentSubType,
  MarketSegmentType,
  MarketUpdateAction,
  MassActionReason,
  MassActionRejectReason,
  MassActionResponse,
  MassActionScope,
  MassActionType,
  MassCancelRejectReason,
  MassCancelRequestType,
  MassCancelResponse,
  MassOrderRequestResult,
  MassOrderRequestStatus,
  MassStatusReqType,
  MatchExceptionElementType,
  MatchExceptionToleranceValueType,
  MatchExceptionType,
  MatchInst,
  MatchStatus,
  MatchType,
  MatchingDataPointIndicator,
  MaturityMonthYearFormat,
  MaturityMonthYearIncrementUnits,
  MessageEncoding,
  MinQtyMethod,
  MiscFeeBasis,
  MiscFeeQualifier,
  MiscFeeType,
  ModelType,
  MoneyLaunderingStatus,
  MsgDirection,
  MsgType,
  MultiJurisdictionReportingIndicator,
  MultiLegReportingType,
  MultiLegRptTypeReq,
  MultilegModel,
  MultilegPriceMethod,
  NBBOEntryType,
  NBBOSource,
  NegotiationMethod,
  NetGrossInd,
  NetworkRequestType,
  NetworkStatusResponseType,
  NewsCategory,
  NewsRefType,
  NoSides,
  NonCashDividendTreatment,
  NonDeliverableFixingDateType,
  NotAffectedReason,
  NotifyBrokerOfCredit,
  ObligationType,
  OddLot,
  OffsetInstruction,
  OffshoreIndicator,
  OpenClose,
  OpenCloseSettlFlag,
  OpenCloseSettleFlag,
  OptPayoutType,
  OptionExerciseDateType,
  OrdRejReason,
  OrdStatus,
  OrdType,
  OrderAttributeType,
  OrderCapacity,
  OrderCategory,
  OrderDelayUnit,
  OrderEntryAction,
  OrderEventReason,
  OrderEventType,
  OrderHandlingInstSource,
  OrderOrigination,
  OrderOwnershipIndicator,
  OrderRelationship,
  OrderResponseLevel,
  OrderRestrictions,
  OrigCustOrderCapacity,
  OwnerType,
  OwnershipType,
  PartyActionRejectReason,
  PartyActionResponse,
  PartyActionType,
  PartyDetailDefinitionStatus,
  PartyDetailRequestResult,
  PartyDetailRequestStatus,
  PartyDetailRoleQualifier,
  PartyDetailStatus,
  PartyIDSource,
  PartyRelationship,
  PartyRiskLimitStatus,
  PartyRole,
  PartySubIDType,
  PayReportStatus,
  PayReportTransType,
  PayRequestStatus,
  PayRequestTransType,
  PaymentDateOffsetDayType,
  PaymentForwardStartType,
  PaymentMethod,
  PaymentPaySide,
  PaymentScheduleStepRelativeTo,
  PaymentScheduleType,
  PaymentSettlStyle,
  PaymentStreamAveragingMethod,
  PaymentStreamCapRateBuySide,
  PaymentStreamCompoundingMethod,
  PaymentStreamDiscountType,
  PaymentStreamFRADiscounting,
  PaymentStreamFloorRateBuySide,
  PaymentStreamInflationInterpolationMethod,
  PaymentStreamInflationLagDayType,
  PaymentStreamInflationLagUnit,
  PaymentStreamInterpolationPeriod,
  PaymentStreamLinkStrikePriceType,
  PaymentStreamNegativeRateTreatment,
  PaymentStreamPaymentDateOffsetDayType,
  PaymentStreamPaymentDateOffsetUnit,
  PaymentStreamPaymentFrequencyUnit,
  PaymentStreamPricingDayDistribution,
  PaymentStreamPricingDayOfWeek,
  PaymentStreamRateIndexCurveUnit,
  PaymentStreamRateIndexSource,
  PaymentStreamRateSpreadPositionType,
  PaymentStreamRateSpreadType,
  PaymentStreamRateTreatment,
  PaymentStreamRealizedVarianceMethod,
  PaymentStreamResetWeeklyRollConvention,
  PaymentStreamSettlLevel,
  PaymentStreamType,
  PaymentStubLength,
  PaymentStubType,
  PaymentSubType,
  PaymentType,
  PegLimitType,
  PegMoveType,
  PegOffsetType,
  PegPriceType,
  PegRoundDirection,
  PegScope,
  PosAmtReason,
  PosAmtType,
  PosMaintAction,
  PosMaintResult,
  PosMaintStatus,
  PosQtyStatus,
  PosReqResult,
  PosReqStatus,
  PosReqType,
  PosTransType,
  PosType,
  PositionCapacity,
  PositionEffect,
  PossDupFlag,
  PossResend,
  PostTradePaymentDebitOrCredit,
  PostTradePaymentStatus,
  PreallocMethod,
  PreviouslyReported,
  PriceLimitType,
  PriceMovementType,
  PriceProtectionScope,
  PriceQualifier,
  PriceQuoteMethod,
  PriceType,
  PriorityIndicator,
  PrivateQuote,
  ProcessCode,
  Product,
  ProgRptReqs,
  ProtectionTermEventDayType,
  ProtectionTermEventQualifier,
  ProtectionTermEventUnit,
  ProvisionBreakFeeElection,
  ProvisionCalculationAgent,
  ProvisionCashSettlMethod,
  ProvisionCashSettlPaymentDateType,
  ProvisionCashSettlQuoteType,
  ProvisionDateTenorUnit,
  ProvisionOptionExerciseEarliestDateOffsetUnit,
  ProvisionOptionExerciseFixedDateType,
  ProvisionOptionSinglePartyBuyerSide,
  ProvisionType,
  PublishTrdIndicator,
  PutOrCall,
  QtyType,
  QuantityType,
  QuoteAckStatus,
  QuoteAttributeType,
  QuoteCancelType,
  QuoteCondition,
  QuoteEntryRejectReason,
  QuoteEntryStatus,
  QuoteModelType,
  QuotePriceType,
  QuoteRejectReason,
  QuoteRequestRejectReason,
  QuoteRequestType,
  QuoteRespType,
  QuoteResponseLevel,
  QuoteSideIndicator,
  QuoteStatus,
  QuoteType,
  RateSource,
  RateSourceType,
  RefOrdIDReason,
  RefOrderIDSource,
  RefRiskLimitCheckIDType,
  ReferenceDataDateType,
  ReferenceEntityType,
  RegistRejReasonCode,
  RegistStatus,
  RegistTransType,
  RegulatoryReportType,
  RegulatoryTradeIDEvent,
  RegulatoryTradeIDScope,
  RegulatoryTradeIDSource,
  RegulatoryTradeIDType,
  RegulatoryTransactionType,
  RelatedInstrumentType,
  RelatedOrderIDSource,
  RelatedPositionIDSource,
  RelatedPriceSource,
  RelatedTradeIDSource,
  RelativeValueSide,
  RelativeValueType,
  ReleaseInstruction,
  RemunerationIndicator,
  ReportToExch,
  RequestResult,
  ResetSeqNumFlag,
  RespondentType,
  ResponseTransportType,
  RestructuringType,
  ReturnRateDateMode,
  ReturnRatePriceBasis,
  ReturnRatePriceSequence,
  ReturnRatePriceType,
  ReturnRateQuoteTimeType,
  ReturnRateValuationPriceOption,
  ReturnTrigger,
  RiskLimitAction,
  RiskLimitCheckModelType,
  RiskLimitCheckRequestResult,
  RiskLimitCheckRequestStatus,
  RiskLimitCheckRequestType,
  RiskLimitCheckStatus,
  RiskLimitCheckTransType,
  RiskLimitCheckType,
  RiskLimitReportRejectReason,
  RiskLimitReportStatus,
  RiskLimitRequestResult,
  RiskLimitRequestType,
  RiskLimitType,
  RoundingDirection,
  RoutingArrangmentIndicator,
  RoutingType,
  Rule80A,
  Scope,
  SecurityClassificationReason,
  SecurityIDSource,
  SecurityListRequestType,
  SecurityListType,
  SecurityListTypeSource,
  SecurityRejectReason,
  SecurityRequestResult,
  SecurityRequestType,
  SecurityResponseType,
  SecurityStatus,
  SecurityTradingEvent,
  SecurityTradingStatus,
  SecurityType,
  SecurityUpdateAction,
  SelfMatchPreventionInstruction,
  Seniority,
  SessionRejectReason,
  SessionStatus,
  SettlCurrFxRateCalc,
  SettlDeliveryType,
  SettlDisruptionProvision,
  SettlInstMode,
  SettlInstReqRejCode,
  SettlInstSource,
  SettlInstTransType,
  SettlLocation,
  SettlMethod,
  SettlObligMode,
  SettlObligSource,
  SettlObligTransType,
  SettlPriceType,
  SettlSessID,
  SettlSubMethod,
  SettlType,
  SettlmntTyp,
  ShortSaleExemptionReason,
  ShortSaleReason,
  ShortSaleRestriction,
  Side,
  SideAvgPxIndicator,
  SideClearingTradePriceType,
  SideMultiLegReportingType,
  SideValueInd,
  SingleQuoteIndicator,
  SolicitedFlag,
  StandInstDbType,
  StatsType,
  StatusValue,
  StipulationType,
  StrategyParameterType,
  StrategyType,
  StreamAsgnAckType,
  StreamAsgnRejReason,
  StreamAsgnReqType,
  StreamAsgnType,
  StreamCommodityDataSourceIDType,
  StreamCommodityNearbySettlDayUnit,
  StreamCommoditySettlDateRollUnit,
  StreamNotionalAdjustments,
  StreamNotionalCommodityFrequency,
  StreamType,
  StrikeIndexQuote,
  StrikePriceBoundaryMethod,
  StrikePriceDeterminationMethod,
  SubscriptionRequestType,
  SwapClass,
  SwapSubClass,
  SymbolSfx,
  TargetStrategy,
  TaxAdvantageType,
  TaxonomyType,
  TerminationType,
  TestMessageIndicator,
  ThrottleAction,
  ThrottleCountIndicator,
  ThrottleInst,
  ThrottleStatus,
  ThrottleType,
  TickDirection,
  TickRuleType,
  TimeInForce,
  TimeUnit,
  TradSesControl,
  TradSesEvent,
  TradSesMethod,
  TradSesMode,
  TradSesStatus,
  TradSesStatusRejReason,
  TradeAggregationRejectReason,
  TradeAggregationRequestStatus,
  TradeAggregationTransType,
  TradeAllocGroupInstruction,
  TradeAllocIndicator,
  TradeAllocStatus,
  TradeCollateralization,
  TradeCondition,
  TradeContingency,
  TradeContinuation,
  TradeHandlingInstr,
  TradeMatchAckStatus,
  TradeMatchRejectReason,
  TradePriceCondition,
  TradePriceNegotiationMethod,
  TradePublishIndicator,
  TradeQtyType,
  TradeReportRejectReason,
  TradeReportTransType,
  TradeReportType,
  TradeReportingIndicator,
  TradeRequestResult,
  TradeRequestStatus,
  TradeRequestType,
  TradeType,
  TradeVolType,
  TradedFlatSwitch,
  TradingCapacity,
  TradingSessionID,
  TradingSessionSubID,
  TransactionAttributeType,
  TransferRejectReason,
  TransferReportType,
  TransferScope,
  TransferStatus,
  TransferTransType,
  TransferType,
  TrdAckStatus,
  TrdRegPublicationReason,
  TrdRegPublicationType,
  TrdRegTimestampManualIndicator,
  TrdRegTimestampType,
  TrdRptStatus,
  TrdSubType,
  TrdType,
  TriggerAction,
  TriggerOrderType,
  TriggerPriceDirection,
  TriggerPriceType,
  TriggerPriceTypeScope,
  TriggerScope,
  TriggerType,
  Triggered,
  UnderlyingCashType,
  UnderlyingFXRateCalc,
  UnderlyingNotionalAdjustments,
  UnderlyingObligationType,
  UnderlyingPriceDeterminationMethod,
  UnderlyingSettlementType,
  UnitOfMeasure,
  UnitofMeasure,
  UnsolicitedIndicator,
  UpfrontPriceType,
  Urgency,
  UserRequestType,
  UserStatus,
  ValuationMethod,
  ValueCheckAction,
  ValueCheckType,
  VenueType,
  VerificationMethod,
  WorkingIndicator,
  YieldType,
});

/** Every field that has a value group, e.g. `"Side"`. */
export type ValueGroupName = keyof ValueGroups;
