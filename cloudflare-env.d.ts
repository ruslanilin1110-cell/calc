declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    LEDGER_RESET_TOKEN?: string;
    LEDGER_RESET_OWNER?: string;
    LEDGER_RESET_EXPIRES?: string;
    BUCKET?: R2Bucket;
  }
}
