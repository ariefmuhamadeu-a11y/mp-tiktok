import { escapeShipmentHtml as escapeHtml } from '../services/shipmentService.js';

const storageKey = 'mp-tiktok-promotions-v1';
const tabs = new Set(['summary', 'voucher', 'bundle', 'campaign']);
const tabMeta = {
    voucher: { label: 'Voucher', icon: 'bi-ticket-perforated', title: 'Voucher', description: 'Kelola kode voucher dan periode penggunaannya.' },
    bundle: { label: 'Bundle / Paket', icon: 'bi-box-seam', title: 'Bundle / Paket', description: 'Susun paket produk, harga normal, dan harga paket.' },
    campaign: { label: 'Campaign', icon: 'bi-megaphone', title: 'Campaign', description: 'Catat campaign, channel, target, dan periode promosi.' }
};
const state = { tab: 'summary', workspace: null };

function element(id) {
    return document.getElementById(id);
}

function readPromotions() {
    try {
        const value = JSON.parse(localStorage.getItem(storageKey) || '[]');
        return Array.isArray(value) ? value : [];
    } catch (_) {
        return [];
    }
}

function writePromotions(promotions) {
    localStorage.setItem(storageKey, JSON.stringify(promotions));
}

function money(value) {
    const amount = Number(value || 0);
    return amount > 0 ? 'Rp' + amount.toLocaleString('id-ID') : '—';
}

function number(value) {
    return Number(value || 0).toLocaleString('id-ID');
}

function dateLabel(value) {
    if (!value) return '—';
    const date = new Date(value + 'T00:00:00');
    return Number.isNaN(date.getTime()) ? escapeHtml(value) : date.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}

function periodLabel(promotion) {
    return dateLabel(promotion.start) + ' – ' + dateLabel(promotion.end);
}

function statusLabel(status) {
    return status === 'active' ? '<span class="workspace-badge success">Aktif</span>' : '<span class="workspace-badge">Draft</span>';
}

function formatDiscount(promotion) {
    if (!promotion.discountValue) return '—';
    return promotion.discountType === 'percent'
        ? Number(promotion.discountValue).toLocaleString('id-ID') + '%'
        : money(promotion.discountValue);
}

function emptyRow(colspan, text) {
    return '<tr><td colspan="' + colspan + '" class="workspace-empty">' + text + '</td></tr>';
}

function kpi(label, value, hint, icon) {
    return '<div class="workspace-kpi"><div class="workspace-kpi-label">' + label + ' <i class="bi ' + icon + '"></i></div><strong>' + value + '</strong><small>' + hint + '</small></div>';
}

function promotionRows(promotions, type) {
    return promotions.filter((promotion) => promotion.type === type).sort((a, b) => String(b.start || '').localeCompare(String(a.start || '')));
}

function detectedDiscountLabel(type) {
    return {
        seller: 'Diskon produk seller',
        platform: 'Diskon produk platform',
        payment: 'Diskon pembayaran',
        shipping_seller: 'Diskon ongkir seller',
        shipping_platform: 'Diskon ongkir platform'
    }[type] || type || 'Diskon lain';
}

function detectedDiscountStatus(source) {
    return source === 'backfill'
        ? '<span class="workspace-badge">Terdeteksi dari import</span>'
        : '<span class="workspace-badge">Tersambung</span>';
}

function renderDetectedDiscounts() {
    const rows = state.workspace?.detectedDiscounts || [];
    const target = element('promotionDetectedRows');
    if (!target) return;
    target.innerHTML = rows.length
        ? rows.map((row) =>
            '<tr><td><strong>' + escapeHtml(detectedDiscountLabel(row.discount_type)) + '</strong></td>' +
            '<td>' + escapeHtml(row.funded_by || 'unknown') + '</td>' +
            '<td class="numeric-cell">' + number(row.order_count) + '</td>' +
            '<td class="numeric-cell">' + number(row.line_count) + '</td>' +
            '<td class="numeric-cell">' + money(row.amount) + '</td>' +
            '<td>' + detectedDiscountStatus(row.source) + '</td></tr>'
        ).join('')
        : emptyRow(6, 'Belum ada diskon terdeteksi dari order.');
}

function renderSummary(promotions) {
    const active = promotions.filter((promotion) => promotion.status === 'active').length;
    const voucherCount = promotions.filter((promotion) => promotion.type === 'voucher').length;
    const bundleCount = promotions.filter((promotion) => promotion.type === 'bundle').length;
    const campaignCount = promotions.filter((promotion) => promotion.type === 'campaign').length;
    element('promotionKpis').innerHTML = [
        kpi('Total promosi', number(promotions.length), 'Semua promo yang dicatat', 'bi-tags'),
        kpi('Promo aktif', number(active), 'Sedang berjalan', 'bi-lightning-charge'),
        kpi('Voucher', number(voucherCount), 'Kode promo tersimpan', 'bi-ticket-perforated'),
        kpi('Bundle / paket', number(bundleCount), 'Paket produk tersimpan', 'bi-box-seam')
    ].join('');
    element('promotionSummaryRows').innerHTML = promotions.length
        ? promotions.slice().sort((a, b) => String(b.start || '').localeCompare(String(a.start || ''))).map((promotion) =>
            '<tr><td><strong>' + escapeHtml(promotion.name) + '</strong><span class="muted-line">' + escapeHtml(tabMeta[promotion.type]?.label || promotion.type) + '</span></td>' +
            '<td>' + periodLabel(promotion) + '</td><td>' + escapeHtml(promotion.code || promotion.items || promotion.channel || '—') + '</td>' +
            '<td class="numeric-cell">' + formatDiscount(promotion) + '</td><td class="numeric-cell">' + number(promotion.usage) + '</td><td>' + statusLabel(promotion.status) + '</td></tr>'
        ).join('')
        : emptyRow(6, 'Belum ada promosi. Tambahkan voucher, bundle, atau campaign pertama.');
    const detectedCount = Number(state.workspace?.summary?.detected_discount_count || 0);
    element('promotionSummaryNote').textContent = campaignCount
        ? campaignCount + ' campaign tercatat. Nominal diskon dari order tetap mengikuti data Pengiriman/Keuangan.'
        : detectedCount
            ? number(detectedCount) + ' baris diskon order sudah terdeteksi dari import. Jenis voucher atau bundle belum tersedia dari sumber data.'
            : 'File Pengiriman belum menyediakan jenis promo; modul ini menjadi tempat pencatatan dan pengelompokan promosi.';
}

function renderVoucher(promotions) {
    const rows = promotionRows(promotions, 'voucher');
    element('promotionVoucherRows').innerHTML = rows.length ? rows.map((promotion) =>
        '<tr><td><strong>' + escapeHtml(promotion.name) + '</strong></td><td>' + escapeHtml(promotion.code || '—') + '</td>' +
        '<td>' + periodLabel(promotion) + '</td><td class="numeric-cell">' + formatDiscount(promotion) + '</td>' +
        '<td class="numeric-cell">' + number(promotion.usage) + '</td><td>' + statusLabel(promotion.status) + '</td></tr>'
    ).join('') : emptyRow(6, 'Belum ada voucher.');
}

function renderBundle(promotions) {
    const rows = promotionRows(promotions, 'bundle');
    element('promotionBundleRows').innerHTML = rows.length ? rows.map((promotion) => {
        const saving = Math.max(Number(promotion.normalPrice || 0) - Number(promotion.packagePrice || 0), 0);
        return '<tr><td><strong>' + escapeHtml(promotion.name) + '</strong></td><td>' + escapeHtml(promotion.items || '—') + '</td>' +
            '<td class="numeric-cell">' + money(promotion.normalPrice) + '</td><td class="numeric-cell">' + money(promotion.packagePrice) + '</td>' +
            '<td class="numeric-cell">' + money(saving) + '</td><td>' + periodLabel(promotion) + '</td><td>' + statusLabel(promotion.status) + '</td></tr>';
    }).join('') : emptyRow(7, 'Belum ada bundle atau paket promo.');
}

function renderCampaign(promotions) {
    const rows = promotionRows(promotions, 'campaign');
    element('promotionCampaignRows').innerHTML = rows.length ? rows.map((promotion) =>
        '<tr><td><strong>' + escapeHtml(promotion.name) + '</strong></td><td>' + escapeHtml(promotion.channel || '—') + '</td>' +
        '<td>' + escapeHtml(promotion.target || '—') + '</td><td>' + periodLabel(promotion) + '</td>' +
        '<td class="numeric-cell">' + number(promotion.usage) + '</td><td>' + statusLabel(promotion.status) + '</td></tr>'
    ).join('') : emptyRow(6, 'Belum ada campaign.');
}

function renderFormTypeFields() {
    const type = element('promotionFormType')?.value || 'voucher';
    element('promotionCodeField').hidden = type !== 'voucher';
    element('promotionItemsField').hidden = type !== 'bundle';
    element('promotionBundlePrices').hidden = type !== 'bundle';
    element('promotionBundlePriceField').hidden = type !== 'bundle';
    element('promotionChannelField').hidden = type !== 'campaign';
    element('promotionTargetField').hidden = type !== 'campaign';
    element('promotionDiscountField').hidden = type === 'bundle';
    element('promotionDiscountFieldValue').hidden = type === 'bundle';
}

function openForm(type = 'voucher') {
    element('promotionFormType').value = type;
    renderFormTypeFields();
    element('promotionFormPanel').hidden = false;
    element('promotionFormPanel').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function resetForm() {
    const form = element('promotionForm');
    form.reset();
    element('promotionFormType').value = state.tab === 'bundle' ? 'bundle' : state.tab === 'campaign' ? 'campaign' : 'voucher';
    renderFormTypeFields();
    element('promotionFormPanel').hidden = true;
}

export function renderPromotions() {
    const promotions = readPromotions();
    renderSummary(promotions);
    renderDetectedDiscounts();
    renderVoucher(promotions);
    renderBundle(promotions);
    renderCampaign(promotions);
    document.querySelectorAll('[data-promotion-tab]').forEach((button) => {
        const active = button.dataset.promotionTab === state.tab;
        button.classList.toggle('active', active);
        button.setAttribute('aria-selected', String(active));
    });
    document.querySelectorAll('[data-promotion-panel]').forEach((panel) => {
        panel.hidden = panel.dataset.promotionPanel !== state.tab;
    });
}

async function loadPromotionWorkspace() {
    try {
        const response = await fetch('/api/workspace');
        if (!response.ok) return;
        state.workspace = await response.json();
        renderPromotions();
    } catch (_) {
        // Manual promotions remain usable even if the imported workspace is unavailable.
    }
}

export function setupPromotions() {
    document.querySelectorAll('[data-promotion-tab]').forEach((button) => {
        button.addEventListener('click', () => {
            state.tab = tabs.has(button.dataset.promotionTab) ? button.dataset.promotionTab : 'summary';
            renderPromotions();
        });
    });
    document.addEventListener('click', (event) => {
        const button = event.target.closest('[data-promotion-open-form]');
        if (button) openForm(button.dataset.promotionOpenForm || 'voucher');
        if (event.target.closest('[data-promotion-cancel]')) resetForm();
    });
    element('promotionFormType')?.addEventListener('change', renderFormTypeFields);
    element('promotionForm')?.addEventListener('submit', (event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const data = new FormData(form);
        const promotion = {
            id: Date.now(),
            type: String(data.get('type') || 'voucher'),
            name: String(data.get('name') || '').trim(),
            code: String(data.get('code') || '').trim(),
            items: String(data.get('items') || '').trim(),
            start: String(data.get('start') || ''),
            end: String(data.get('end') || ''),
            discountType: String(data.get('discountType') || 'percent'),
            discountValue: Number(data.get('discountValue') || 0),
            normalPrice: Number(data.get('normalPrice') || 0),
            packagePrice: Number(data.get('packagePrice') || 0),
            channel: String(data.get('channel') || '').trim(),
            target: String(data.get('target') || '').trim(),
            usage: Number(data.get('usage') || 0),
            status: String(data.get('status') || 'draft')
        };
        if (!promotion.name) return;
        writePromotions([...readPromotions(), promotion]);
        resetForm();
        renderPromotions();
    });
    renderFormTypeFields();
    renderPromotions();
    loadPromotionWorkspace();
}
