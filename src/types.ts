export type ThemeName = 'linen' | 'graphite' | 'midnight';

export type SessionRole = 'user' | 'admin';

export type LanguageCode = 'zh' | 'ms' | 'en';

export type DataCacheState = 'fresh' | 'cached' | 'stale' | 'offline';

/** A concise, user-facing market-data state. Provider details remain server-side. */
export type MarketDataState = 'broker' | 'live' | 'cached' | 'fallback' | 'paper';

export interface SourceMeta {
  provider: string;
  mode: 'mock' | 'http' | 'rss' | 'api' | 'broker';
  updatedAt: string;
  cacheState: DataCacheState;
  dataState?: MarketDataState;
  endpoint?: string;
  latencyMs?: number;
  health?: 'healthy' | 'degraded' | 'offline';
  lineage?: string;
}

export interface MarketAsset {
  symbol: string;
  name: string;
  assetClass?: 'crypto' | 'commodity' | 'forex' | 'equity' | 'index';
  price: number;
  change24h: number;
  volume24h: number;
  spreadBps: number;
  updatedAt: string;
  bid?: number;
  ask?: number;
  dataState?: MarketDataState;
}

export interface MarketQuote extends MarketAsset {
  high24h: number;
  low24h: number;
  open24h: number;
  marketCap?: number;
  source: SourceMeta;
}

export interface Candle {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface OrderLevel {
  price: number;
  size: number;
  depth: number;
  side: 'bid' | 'ask';
}

export interface MarketBundle {
  assets: MarketAsset[];
  selected: MarketQuote;
  candles: Candle[];
  orderBook: {
    asks: OrderLevel[];
    bids: OrderLevel[];
  };
  depth: {
    bids: Array<{ price: number; cumulative: number }>;
    asks: Array<{ price: number; cumulative: number }>;
  };
  source: SourceMeta;
}

export interface NewsItem {
  id: string;
  title: string;
  category: string;
  source: string;
  publishedAt: string;
  summary: string;
  tone: 'neutral' | 'positive' | 'alert';
  markets: string[];
  country: string;
  impact: 'high' | 'medium' | 'low';
  targetPath?: string;
  url?: string;
}

export interface NewsEvent {
  id: string;
  title: string;
  market: string;
  country: string;
  scheduledAt: string;
  impact: 'high' | 'medium' | 'low';
  description: string;
}

export interface NewsBundle {
  items: NewsItem[];
  categories: string[];
  events: NewsEvent[];
  source: SourceMeta;
}

export interface NotificationItem {
  id: string;
  category: 'system' | 'market' | 'task' | 'fund';
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
  level: 'info' | 'success' | 'warning' | 'critical';
  targetPath?: string;
}

export interface NotificationBundle {
  items: NotificationItem[];
  source: SourceMeta;
}

export interface SupportMessage {
  id: string;
  threadId: string;
  userId: string;
  userName: string;
  userEmail: string;
  userPhone?: string;
  senderRole: 'user' | 'admin';
  body: string;
  createdAt: string;
}

export interface LedgerEntry {
  id: string;
  type: 'deposit' | 'withdraw' | 'transfer' | 'review';
  amount: number;
  currency: string;
  status: 'pending' | 'approved' | 'rejected' | 'settled';
  time: string;
  note: string;
  refId: string;
  direction: 'in' | 'out';
  userEmail?: string;
  userName?: string;
}

export interface LedgerBundle {
  entries: LedgerEntry[];
  source: SourceMeta;
}

/**
 * Funding is deliberately limited to a paper-account review workflow. It is
 * not a banking, wallet, settlement, or payout instruction.
 */
export type FundingKind = 'deposit' | 'withdraw';

export type FundingMethod = 'tng' | 'bank';

export interface FundingRate {
  /** MYR per 1 paper U before the funding-side adjustment. */
  baseRate: number;
  /** Deposit quote: base MYR/U + 0.05. */
  depositRate: number;
  /** Withdrawal quote: base MYR/U - 0.05. */
  withdrawalRate: number;
  source: string;
  updatedAt: string;
  cacheState: 'fresh' | 'cached' | 'fallback';
}

export interface FundingRequest {
  id: string;
  userId: string;
  userName: string;
  email: string;
  kind: FundingKind;
  method: FundingMethod;
  bankName?: string;
  /** Optional display-only holder name for a sandbox review. */
  accountHolder?: string;
  /** A masked account / wallet reference only; never a full bank credential. */
  accountReference?: string;
  amountMyr: number;
  amountU: number;
  rate: number;
  baseRate: number;
  rateSource: string;
  rateUpdatedAt: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
  reviewedAt?: string;
  reviewer?: string;
  reviewerNote?: string;
  supportRequired?: boolean;
  ledgerEntryId?: string;
}

export interface AutomationTask {
  id: string;
  name: string;
  status: 'running' | 'paused' | 'scheduled' | 'draft';
  schedule: string;
  lastRun: string;
  nextRun: string;
  successRate: number;
  autoSync: boolean;
  autoNotify: boolean;
  logs: string[];
}

export interface AutomationBundle {
  tasks: AutomationTask[];
  source: SourceMeta;
}

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  phone: string;
  country?: string;
  role: SessionRole;
  status: 'active' | 'pending' | 'locked';
  joinedAt: string;
  tier: string;
  tradingScore?: number;
}

export interface RegisteredUser {
  id: string;
  fullName: string;
  gmail: string;
  phone: string;
  country: string;
  status: 'pending' | 'approved' | 'rejected';
  submittedAt: string;
  tradingScore: number;
  passwordDigest?: string;
}

export interface BlacklistEntry {
  id: string;
  userId: string;
  name: string;
  email: string;
  phone: string;
  country: string;
  reason: string;
  blacklistedAt: string;
  blacklistedBy: string;
}

export interface AdminBundle {
  users: UserProfile[];
  registrations: RegisteredUser[];
  paperPositions: PaperPosition[];
  tradeEvents: TradeAuditEvent[];
  creditAccounts: CreditAccount[];
  creditRequests: CreditRequest[];
  fundingRequests: FundingRequest[];
  ledgerEntries: LedgerEntry[];
  blacklist: BlacklistEntry[];
  notifications: NotificationItem[];
  marketStatus: {
    status: 'healthy' | 'degraded' | 'offline';
    quoteCount: number;
    ageSeconds: number | null;
    cacheSeconds: number;
    snapshotId?: string;
    snapshotBuiltAt?: string | null;
    twelveDataConfigured?: boolean;
  };
  report: {
    monthLabel: string;
    totalAccounts: number;
    monthlyRegistrations: number;
    monthlyApproved: number;
    monthlyLedgerEntries: number;
    monthlyInflow: number;
    monthlyOutflow: number;
    monthlyPositions: number;
    unreadNotifications: number;
    averageTradingScore: number;
  };
  approvals: Array<{
    id: string;
    subject: string;
    owner: string;
    status: 'pending' | 'approved' | 'rejected';
    updatedAt: string;
  }>;
  configs: Array<{
    key: string;
    value: string;
    scope: string;
  }>;
  source: SourceMeta;
}

export interface ShellLink {
  to: string;
  label: string;
  icon: string;
}

export type TradeSide = 'long' | 'short';

export type TradeAuditAction = 'open' | 'close' | 'partial-close' | 'risk-update' | 'liquidation';

export interface TradeAuditEvent {
  id: string;
  positionId?: string;
  userId: string;
  userName?: string;
  userEmail?: string;
  symbol: string;
  side: TradeSide;
  action: TradeAuditAction;
  lots: number;
  price: number;
  contractSize?: number;
  leverage?: number;
  margin?: number;
  /** Realized paper-trade PnL, captured when a position is closed. */
  pnl?: number;
  createdAt: string;
}

export type TimeframeCode = 'M1' | 'M5' | 'M15' | 'M30' | 'H1' | 'H4' | 'D1' | 'W1' | 'MN';

export interface PaperPosition {
  id: string;
  userId?: string;
  userName?: string;
  symbol: string;
  side: TradeSide;
  lots: number;
  contractSize: number;
  leverage: number;
  entryPrice: number;
  markPrice: number;
  notional: number;
  margin: number;
  stopLoss?: number;
  takeProfit?: number;
  openedAt: string;
  remainingLots?: number;
  closedLots?: number;
  status?: 'open' | 'partial' | 'closed';
  closedAt?: string;
}

export interface CreditAccount {
  userId: string;
  userName: string;
  email: string;
  balance: number;
  available: number;
  pending: number;
  grantedTotal: number;
  updatedAt: string;
}

export interface CreditRequest {
  id: string;
  userId: string;
  userName: string;
  email: string;
  amount: number;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  requestedAt: string;
  reviewedAt?: string;
  reviewer?: string;
}
