import { escapeShipmentHtml as escapeHtml } from '../services/shipmentService.js';

const element = (id) => document.getElementById(id);
const state = { data: null, search: '' };
const count = (value) => Number(value || 0).toLocaleString('id-ID');
const money = (value) => 'Rp' + Math.abs(Number(value || 0)).toLocaleString('id-ID');
const safe = (value) => escapeHtml(value || '—');

function dateLabel(value) {
    if (!value) return '—';
    const date = new Date(String(value).replace(' ', 'T'));
    return Number.isNaN(date.getTime()) ? safe(value) : new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }).format(date);
}

function kpi(label, value, hint, icon) {
    return '<article class="workspace-kpi"><div class="label"><span>' + label + '</span><i class="bi ' + icon + '"></i></div>' +
        '<div class="value">' + value + '</div><div class="hint">' + hint + '</div></article>';
}

function financeBadge(status) {
    return status === 'credited_to_balance'
        ? '<span class="workspace-badge success">Masuk saldo</span>'
        : '<span class="workspace-badge warning">Belum dilaporkan</span>';
}

function shippingBadge(order) {
    if (order.deliveredAt) return '<span class="workspace-badge success">Terkirim</span>';
    if (order.shippedAt) return '<span class="workspace-badge">Dalam pengiriman</span>';
    return '<span class="workspace-badge">' + safe(order.status) + '</span>';
}

function renderDashboard(data) {
    const summary = data.summary;
    element('dashboardKpis').innerHTML = [
        kpi('Total pesanan', count(summary.total_orders), 'Order unik di toko ini', 'bi-bag-check'),
        kpi('Paket diterima', count(summary.delivered_packages), count(summary.shipped_packages) + ' paket sudah dikirim', 'bi-truck'),
        kpi('Dana masuk saldo', count(summary.credited_orders), 'Order cocok dengan laporan keuangan', 'bi-wallet2'),
        kpi('Belum dilaporkan', count(summary.pending_orders), 'Order belum ada di laporan keuangan', 'bi-hourglass-split')
    ].join('');

    element('dashboardOrderRows').innerHTML = data.orders.slice(0, 6).map((order) =>
        '<tr><td><strong>' + safe(order.orderId) + '</strong><span class="muted-line">' + dateLabel(order.createdAt) + '</span></td>' +
        '<td class="product-cell"><strong>' + safe(order.product) + '</strong><small>' + safe(order.variant) + ' · ' + safe(order.sellerSku || order.skuId) + '</small></td>' +
        '<td>' + shippingBadge(order) + '</td><td>' + financeBadge(order.financialStatus) + '</td></tr>'
    ).join('') || '<tr><td colspan="4" class="workspace-empty">Belum ada pesanan untuk toko ini.</td></tr>';

    element('dashboardImportRows').innerHTML = data.imports.map((batch) =>
        '<tr><td><strong>' + safe(batch.filename) + '</strong></td><td>' + (batch.kind === 'shipment' ? 'Pengiriman' : 'Pencairan') +
        '</td><td>' + count(batch.rowCount) + '</td><td>' + count(batch.duplicateCount) + '</td><td>' + dateLabel(batch.importedAt) + '</td></tr>'
    ).join('') || '<tr><td colspan="5" class="workspace-empty">Belum ada file yang diimpor ke database.</td></tr>';
}

function renderOrders(data) {
    const summary = data.summary;
    element('ordersKpis').innerHTML = [
        kpi('Order', count(summary.total_orders), 'Nomor order unik', 'bi-bag'),
        kpi('Paket dikirim', count(summary.shipped_packages), 'Sudah punya waktu kirim', 'bi-box-seam'),
        kpi('Paket diterima', count(summary.delivered_packages), 'Sudah punya waktu diterima', 'bi-check2-circle'),
        kpi('Total nilai order', money(summary.gross_order_amount), 'Bukan dana bersih yang dicairkan', 'bi-cash-stack')
    ].join('');

    const query = state.search.trim().toLowerCase();
    const visible = data.orders.filter((order) =>
        [order.orderId, order.product, order.variant, order.sellerSku, order.skuId, order.tracking]
            .some((value) => String(value || '').toLowerCase().includes(query))
    );
    element('ordersResultCount').textContent = count(visible.length) + ' item ditampilkan';
    element('ordersTableBody').innerHTML = visible.map((order) =>
        '<tr><td><strong>' + safe(order.orderId) + '</strong></td>' +
        '<td class="product-cell"><strong>' + safe(order.product) + '</strong><small>' + safe(order.variant) + '</small></td>' +
        '<td>' + safe(order.sellerSku || order.skuId) + '<span class="muted-line">SKU ID: ' + safe(order.skuId) + ' · Qty ' + count(order.quantity) + '</span></td>' +
        '<td>' + safe(order.tracking) + '<span class="muted-line">' + safe(order.courier) + '</span></td>' +
        '<td>' + shippingBadge(order) + '</td><td>' + financeBadge(order.financialStatus) + '</td><td>' + money(order.amount) + '</td></tr>'
    ).join('') || '<tr><td colspan="7" class="workspace-empty">Tidak ada item yang cocok.</td></tr>';
}

function renderFinance(data) {
    const summary = data.summary;
    const netSettlement = Number(summary.order_settlement) + Number(summary.other_settlement);
    element('financeKpis').innerHTML = [
        kpi('Pesanan masuk saldo', count(summary.credited_orders), 'Dari file pengiriman yang cocok', 'bi-check2-circle'),
        kpi('Penyelesaian bersih', money(netSettlement), 'Semua transaksi di laporan, termasuk penyesuaian', 'bi-wallet2'),
        kpi('Transaksi belum cocok', count(summary.unmatched_orders), 'Baris pesanan laporan tanpa order pengiriman', 'bi-exclamation-circle'),
        kpi('Penarikan bank', money(summary.withdrawal_amount), 'Catatan transfer, bukan nilai per order', 'bi-bank')
    ].join('');

    const uniqueOrders = Array.from(new Map(data.orders.map((order) => [order.orderId, order])).values());
    element('financeOrderRows').innerHTML = uniqueOrders.map((order) =>
        '<tr><td><strong>' + safe(order.orderId) + '</strong></td><td>' + money(order.amount) + '</td><td>' + financeBadge(order.financialStatus) + '</td></tr>'
    ).join('') || '<tr><td colspan="3" class="workspace-empty">Belum ada pesanan untuk direkonsiliasi.</td></tr>';

    element('financeAttention').innerHTML =
        '<div><strong>' + count(summary.pending_orders) + ' order pengiriman</strong><small>Belum ditemukan sebagai dana masuk saldo.</small></div>' +
        '<div><strong>' + count(summary.unmatched_orders) + ' transaksi pesanan</strong><small>Ada di laporan keuangan tetapi belum cocok dengan file pengiriman.</small></div>' +
        '<div><strong>' + count(summary.transfer_count) + ' baris transfer</strong><small>Riwayat transfer disimpan terpisah dari transaksi pesanan.</small></div>';
    element('financePromotions').innerHTML =
        '<div><strong>Seller · ' + money(summary.seller_product_discount) + '</strong><small>Diskon produk yang ditanggung penjual.</small></div>' +
        '<div><strong>Platform · ' + money(summary.platform_product_discount) + '</strong><small>Diskon produk yang ditanggung platform.</small></div>' +
        '<div><strong>Pembayaran platform · ' + money(summary.payment_platform_discount) + '</strong><small>Diskon metode pembayaran dari data order; bukan biaya seller.</small></div>';
}

function renderWorkspace() {
    if (!state.data) return;
    renderDashboard(state.data);
    renderOrders(state.data);
    renderFinance(state.data);
}

async function loadWorkspace(storeId = null) {
    const notice = element('workspaceNotice');
    notice.classList.remove('error');
    notice.innerHTML = '<i class="bi bi-arrow-repeat"></i><span>Memuat data dari database…</span>';
    try {
        const response = await fetch('/api/workspace' + (storeId ? '?storeId=' + encodeURIComponent(storeId) : ''));
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || 'Data tidak tersedia.');
        state.data = data;
        document.querySelectorAll('[data-workspace-store]').forEach((selector) => {
            selector.innerHTML = data.stores.map((store) => '<option value="' + store.id + '">' + safe(store.name) + '</option>').join('') || '<option value="">Belum ada toko</option>';
            selector.value = String(data.selectedStoreId ?? '');
        });
        element('backendStatus').classList.remove('offline');
        element('backendStatus').innerHTML = '<i class="bi bi-circle-fill"></i> Database aktif';
        ['workspaceOrdersError', 'workspaceFinanceError'].forEach((id) => { element(id).hidden = true; });
        notice.innerHTML = '<i class="bi bi-database-check"></i><span>Data database untuk <strong>' +
            safe(data.stores.find((store) => store.id === data.selectedStoreId)?.name || 'toko') +
            '</strong>. Preview impor di browser belum mengubah angka di sini.</span>';
        renderWorkspace();
    } catch (error) {
        state.data = null;
        element('backendStatus').classList.add('offline');
        element('backendStatus').innerHTML = '<i class="bi bi-circle-fill"></i> Database offline';
        notice.classList.add('error');
        notice.innerHTML = '<i class="bi bi-exclamation-triangle"></i><span>' + safe(error.message) +
            ' Jalankan backend lokal agar dashboard dapat membaca database.</span>';
        ['dashboardKpis', 'ordersKpis', 'financeKpis'].forEach((id) => { element(id).innerHTML = ''; });
        ['dashboardOrderRows', 'dashboardImportRows', 'ordersTableBody', 'financeOrderRows', 'financeAttention', 'financePromotions'].forEach((id) => {
            element(id).innerHTML = '';
        });
        ['workspaceOrdersError', 'workspaceFinanceError'].forEach((id) => {
            element(id).hidden = false;
            element(id).textContent = 'Database belum tersedia. Jalankan backend lokal lalu muat ulang halaman.';
        });
    }
}

export function setupWorkspace() {
    document.querySelectorAll('[data-workspace-store]').forEach((selector) => {
        selector.addEventListener('change', (event) => loadWorkspace(event.target.value));
    });
    element('ordersSearch').addEventListener('input', (event) => {
        state.search = event.target.value;
        if (state.data) renderOrders(state.data);
    });
    loadWorkspace();
}
