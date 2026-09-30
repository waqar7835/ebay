import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { InjectModel } from "@nestjs/sequelize";
import { Currency, ExchangeRateDto, ExchangeRates } from "@ebay-order-management/shared";
import { ExchangeRate } from "../database/models/exchange-rate.model";

/** Free, keyless, updated daily. Rates are "units of X per 1 PKR". */
const RATES_API_URL = "https://open.er-api.com/v6/latest/PKR";
/** Saved rates younger than this are used as-is, without calling the API. */
const REFRESH_AFTER_MS = 60 * 60 * 1000;
/** While the API is down, a saved rate is still usable up to this age; older, the admin must enter one. */
const MAX_FALLBACK_AGE_MS = 7 * 24 * 60 * 60 * 1000;
/** After a failed call, don't retry the API for this long. */
const RETRY_AFTER_FAILURE_MS = 5 * 60 * 1000;

@Injectable()
export class ExchangeRatesService {
  private readonly logger = new Logger(ExchangeRatesService.name);
  private lastFailureAt = 0;

  constructor(@InjectModel(ExchangeRate) private readonly exchangeRateModel: typeof ExchangeRate) {}

  /** The latest usable PKR rate for every currency, refreshing from the API when the saved ones are old. */
  async latest(): Promise<ExchangeRateDto[]> {
    let rows = await this.exchangeRateModel.findAll();
    const now = Date.now();
    const needsRefresh =
      rows.length < Object.values(Currency).length || rows.some((r) => now - r.fetchedAt.getTime() > REFRESH_AFTER_MS);

    let apiDown = false;
    if (needsRefresh) {
      apiDown = !(await this.refresh());
      if (!apiDown) rows = await this.exchangeRateModel.findAll();
    }

    const byCurrency = new Map(rows.map((r) => [r.currency, r]));
    return Object.values(Currency).map((currency) => {
      const row = byCurrency.get(currency);
      const unavailable = !row || now - row.fetchedAt.getTime() > MAX_FALLBACK_AGE_MS;
      return {
        currency,
        rate: unavailable ? null : row.rate,
        fetchedAt: row ? row.fetchedAt.toISOString() : null,
        stale: apiDown && !unavailable,
        unavailable,
      };
    });
  }

  /**
   * PKR rates for the given currencies. `manual` rates (typed in by the admin) win; the rest come
   * from latest(). Fails when a currency has neither — the admin has to enter that rate by hand.
   */
  async resolve(currencies: Iterable<Currency>, manual: ExchangeRates = {}): Promise<ExchangeRates> {
    const wanted = [...new Set(currencies)];
    const rates: ExchangeRates = {};
    const needLookup = wanted.filter((c) => {
      const rate = manual[c];
      if (rate !== undefined && rate > 0) rates[c] = rate;
      return rates[c] === undefined;
    });
    if (!needLookup.length) return rates;

    const latest = new Map((await this.latest()).map((r) => [r.currency, r]));
    const missing: Currency[] = [];
    for (const currency of needLookup) {
      const rate = latest.get(currency)?.rate;
      if (rate) rates[currency] = rate;
      else missing.push(currency);
    }
    if (missing.length) {
      throw new BadRequestException(
        `The exchange rate service is unavailable and there is no recent saved rate for ${missing.join(", ")} — enter the PKR rate manually`,
      );
    }
    return rates;
  }

  /** Pulls fresh rates from the API and saves them. Returns false if the API couldn't be reached. */
  private async refresh(): Promise<boolean> {
    if (Date.now() - this.lastFailureAt < RETRY_AFTER_FAILURE_MS) return false;
    try {
      const res = await fetch(RATES_API_URL, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as { result?: string; rates?: Record<string, number> };
      if (body.result !== "success" || !body.rates) throw new Error(`unexpected response: ${body.result}`);

      const fetchedAt = new Date();
      for (const currency of Object.values(Currency)) {
        const perPkr = body.rates[currency];
        if (!perPkr) continue;
        await this.exchangeRateModel.upsert({ currency, rate: round6(1 / perPkr), fetchedAt });
      }
      return true;
    } catch (err) {
      this.lastFailureAt = Date.now();
      this.logger.warn(`Exchange rate refresh failed: ${(err as Error).message}`);
      return false;
    }
  }
}

function round6(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}
