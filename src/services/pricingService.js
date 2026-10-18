export const PPN_RATE = 11;

export function parseMoney(value) {
    const digits = String(value || '').replace(/\D/g, '');
    return digits ? parseInt(digits, 10) : 0;
}

export function parseDecimal(value) {
    const number = parseFloat(String(value || '').replace(',', '.').replace(/[^0-9.]/g, ''));
    return Number.isFinite(number) && number > 0 ? number : 0;
}

export const formatThousands = (digits) => digits ? Number(digits).toLocaleString('id-ID') : '';
export const formatRupiah = (value) => 'Rp' + Math.round(value).toLocaleString('id-ID');
export const formatPercent = (value) => value.toFixed(2) + '%';
export const formatRoas = (value) => value === null || !Number.isFinite(value) ? '–' : value.toFixed(2) + 'x';

export function escapeHtml(value) {
    return String(value || '').replace(/[&<>"']/g, (character) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
    }[character]));
}

export function sumCosts(costs = []) {
    return costs.reduce((total, cost) => {
        const value = cost.unit === 'pct' ? parseDecimal(cost.value) : parseMoney(cost.value);
        if (cost.unit === 'pct') total.pct += value;
        else total.fixed += value;
        return total;
    }, { fixed: 0, pct: 0 });
}

export function suggestPrices(price, count = 4) {
    if (price <= 0) return [];
    let base = Math.floor(price / 1000) * 1000 + 950;
    if (base < price) base += 1000;
    return Array.from({ length: count }, (_, index) => base + index * 1000);
}

export function statusOf(sellingPrice, hpp, netAfterCosts, maxAd) {
    if (sellingPrice < hpp || netAfterCosts - hpp <= 0) return 'rugi';
    if (maxAd <= 0) return 'mepet';
    return 'aman';
}

export function calculatePricing({
    hpp,
    sellingPrice,
    profit,
    roas,
    marketplace,
    custom,
    mode,
    ppnEnabled
}) {
    const adFactor = ppnEnabled ? 1 + PPN_RATE / 100 : 1;
    const warnings = [];
    let price = 0;
    let label = 'Harga Jual Rekomendasi';

    if (mode === 'determine') {
        const share = marketplace.pct / 100 + custom.pct / 100 + profit / 100 + (roas > 0 ? adFactor / roas : 1);
        if (share >= 1) {
            warnings.push('Target tidak memungkinkan. Kurangi fee, target profit, atau naikkan target ROAS.');
        } else if (hpp > 0) {
            price = (hpp + marketplace.fixed + custom.fixed) / (1 - share);
        }
    } else {
        label = 'Harga Jual Dianalisa';
        price = sellingPrice;
        if (price > 0 && hpp > 0 && price < hpp) warnings.push('Harga jual berada di bawah HPP.');
    }

    const marketplaceCostRp = marketplace.fixed + price * marketplace.pct / 100;
    const customCostRp = custom.fixed + price * custom.pct / 100;
    const netAfterCosts = price - marketplaceCostRp - customCostRp;
    const targetProfitRp = price * profit / 100;
    const maxAd = price - marketplaceCostRp - customCostRp - hpp - targetProfitRp;
    const minRoas = maxAd > 0 ? price * adFactor / maxAd : null;
    const breakEven = netAfterCosts - hpp > 0 ? price * adFactor / (netAfterCosts - hpp) : null;

    if (price > 0 && maxAd <= 0 && netAfterCosts - hpp > 0) {
        warnings.push('Tidak ada ruang untuk biaya iklan pada harga jual ini (target profit terlalu tinggi).');
    }

    return {
        price,
        label,
        warnings,
        hasResult: price > 0 && !warnings.includes('Target tidak memungkinkan. Kurangi fee, target profit, atau naikkan target ROAS.'),
        adFactor,
        marketplaceCostRp,
        customCostRp,
        netAfterCosts,
        targetProfitRp,
        maxAd,
        minRoas,
        breakEven
    };
}

export function calculateHppRange({ sellingPrice, marketplace, custom, profit, hppMin, hppMax, ppnEnabled }) {
    if (sellingPrice <= 0 || hppMin <= 0 || hppMax <= 0 || hppMax < hppMin) return [];
    const adFactor = ppnEnabled ? 1 + PPN_RATE / 100 : 1;
    return Array.from({ length: 5 }, (_, index) => {
        const hpp = Math.round(hppMin + (hppMax - hppMin) * index / 4);
        const marketplaceCostRp = marketplace.fixed + sellingPrice * marketplace.pct / 100;
        const customCostRp = custom.fixed + sellingPrice * custom.pct / 100;
        const targetProfitRp = sellingPrice * profit / 100;
        const maxAd = sellingPrice - marketplaceCostRp - customCostRp - hpp - targetProfitRp;
        return {
            hpp,
            maxAd,
            minRoas: maxAd > 0 ? sellingPrice * adFactor / maxAd : null
        };
    });
}
