import {
    calculateHppRange,
    calculatePricing,
    escapeHtml,
    formatPercent as fmtPct,
    formatRoas as fmtRoas,
    formatRupiah as fmtRp,
    formatThousands as fmtThousand,
    parseDecimal as parseDec,
    parseMoney,
    statusOf,
    suggestPrices,
    sumCosts
} from '../services/pricingService.js';
import {
    escapeShipmentHtml as shipmentEscape,
    formatShipmentAmount as shipmentFormatAmount,
    formatShipmentSize as shipmentFormatSize,
    getUniqueShipmentRows,
    parseShipmentFile,
    readShipmentRecords,
    saveShipmentRecords
} from '../services/shipmentService.js';
import {
    escapeIncomeHtml,
    formatIncomeAmount,
    parseIncomeFile
} from '../services/incomeService.js';
import { pageFromPath, pageMeta, pageRoutes } from '../models/appModel.js';
import { renderPage } from '../views/appView.js';
import { refreshWorkspace, setupWorkspace } from './workspaceController.js';
import { renderCatalogPage, setupCatalog } from './catalogController.js';
import { renderPromotions, setupPromotions } from './promotionController.js';

(function initApp() {
    'use strict';

    const el = (id) => document.getElementById(id);
    const body = el('pcBody');
    const PPN_RATE = 11;
    const STORE_STORAGE_KEY = 'mp-tiktok-stores';
    const defaultStores = [
        { id: 1, name: 'Toko Utama', username: '', shopId: '', description: '', updatedAt: '' },
        { id: 2, name: 'Toko Fashion', username: '', shopId: '', description: '', updatedAt: '' },
        { id: 3, name: 'Toko Home Living', username: '', shopId: '', description: '', updatedAt: '' }
    ];
    const defaults = { profitPct: 10, roas: 7 };
    let mode = 'determine';
    let customCosts = [];
    let customCostSeq = 0;
    let marketplaceCosts = [
        { id: 1, name: 'Komisi marketplace', value: '21.17', unit: 'pct' }
    ];
    let marketplaceCostSeq = 1;

    function loadStores() {
        try {
            const stored = JSON.parse(localStorage.getItem(STORE_STORAGE_KEY) || 'null');
            if (Array.isArray(stored)) return stored.filter((store) => store && store.id && store.name);
        } catch (_) {
            // Fall back to the starter data when browser storage is unavailable or malformed.
        }
        return defaultStores.map((store) => ({ ...store }));
    }

    let stores = loadStores();

    function saveStores() {
        localStorage.setItem(STORE_STORAGE_KEY, JSON.stringify(stores));
    }

    const inpHpp = el('inpHpp');
    const inpSelling = el('inpSelling');
    const inpProfit = el('inpProfit');
    const inpRoas = el('inpRoas');
    const inpPpn = el('inpPpn');
    const inpHppMin = el('inpHppMin');
    const inpHppMax = el('inpHppMax');

    inpProfit.value = defaults.profitPct;
    inpRoas.value = defaults.roas;

    function adFactor() {
        return inpPpn.checked ? 1 + PPN_RATE / 100 : 1;
    }

    function readCosts(type) {
        return sumCosts(type === 'marketplace' ? marketplaceCosts : customCosts);
    }

    function setInputValue(input, value) {
        if (!input) return;
        input.value = value;
    }

    function normalizeDecimalInput(input) {
        let value = input.value.replace(',', '.').replace(/[^0-9.]/g, '');
        const parts = value.split('.');
        if (parts.length > 2) value = parts[0] + '.' + parts.slice(1).join('');
        input.value = value;
    }

    function bindCostEditor(type) {
        const isMarketplace = type === 'marketplace';
        const list = el(isMarketplace ? 'marketplaceCostsList' : 'customCostsList');
        const costs = () => isMarketplace ? marketplaceCosts : customCosts;
        const totalElement = el(isMarketplace ? 'marketplaceCostTotal' : 'customCostTotal');

        list.innerHTML = costs().map((cost, index) => {
            const isPercent = cost.unit === 'pct';
            const prefix = isMarketplace ? 'marketplace-' : '';
            return '<div class="pc-custom-row" data-cost-index="' + index + '">' +
                '<input type="text" class="pc-custom-name-input ' + (isMarketplace ? 'pc-marketplace-name-input' : '') +
                '" placeholder="Nama biaya" aria-label="Nama biaya" value="' + escapeHtml(cost.name) + '">' +
                '<div class="pc-custom-entry">' +
                    '<div class="pc-unit-toggle" aria-label="Satuan biaya">' +
                        '<button type="button" data-cost-unit="rp" class="' + (!isPercent ? 'active' : '') + '">Rp</button>' +
                        '<button type="button" data-cost-unit="pct" class="' + (isPercent ? 'active' : '') + '">%</button>' +
                    '</div>' +
                    '<div class="pc-input">' +
                        '<input type="text" class="pc-custom-value ' + (isPercent ? 'js-dec' : 'js-money') +
                        ' ' + (isMarketplace ? 'pc-marketplace-value' : '') + '" inputmode="' +
                        (isPercent ? 'decimal' : 'numeric') + '" value="' + escapeHtml(cost.value) + '">' +
                    '</div>' +
                '</div>' +
                '<button type="button" class="pc-custom-remove" aria-label="Hapus biaya"><i class="bi bi-trash3"></i></button>' +
            '</div>';
        }).join('');

        if (!costs().length) totalElement.textContent = '—';

        list.querySelectorAll('.pc-custom-name-input').forEach((input) => {
            input.addEventListener('input', () => {
                costs()[Number(input.closest('.pc-custom-row').dataset.costIndex)].name = input.value;
            });
            input.addEventListener('focus', () => input.select());
            input.addEventListener('keydown', (event) => {
                if (event.key !== 'Enter') return;
                event.preventDefault();
                event.stopPropagation();
                addCostRow(type);
            });
        });

        list.querySelectorAll('.pc-custom-value').forEach((input) => {
            input.addEventListener('input', () => {
                const cost = costs()[Number(input.closest('.pc-custom-row').dataset.costIndex)];
                if (cost.unit === 'rp') {
                    const cursorFromEnd = input.value.length - input.selectionStart;
                    input.value = fmtThousand(input.value.replace(/\D/g, ''));
                    input.setSelectionRange(
                        Math.max(0, input.value.length - cursorFromEnd),
                        Math.max(0, input.value.length - cursorFromEnd)
                    );
                } else {
                    normalizeDecimalInput(input);
                }
                cost.value = input.value;
                renderPricing();
            });
            input.addEventListener('focus', () => input.select());
            input.addEventListener('keydown', (event) => {
                if (event.key !== 'Enter') return;
                event.preventDefault();
                event.stopPropagation();
                addCostRow(type);
            });
        });

        list.querySelectorAll('[data-cost-unit]').forEach((button) => {
            button.addEventListener('click', () => {
                const cost = costs()[Number(button.closest('.pc-custom-row').dataset.costIndex)];
                const nextUnit = button.dataset.costUnit;
                if (nextUnit !== cost.unit) {
                    const currentPrice = parseMoney(el('hlValue').textContent);
                    const currentValue = cost.unit === 'pct' ? parseDec(cost.value) : parseMoney(cost.value);
                    cost.value = currentPrice > 0 && currentValue > 0
                        ? nextUnit === 'pct'
                            ? (currentValue / currentPrice * 100).toFixed(2)
                            : fmtThousand(String(Math.round(currentPrice * currentValue / 100)))
                        : '';
                    cost.unit = nextUnit;
                }
                bindCostEditor(type);
                renderPricing();
            });
        });

        list.querySelectorAll('.pc-custom-remove').forEach((button) => {
            button.addEventListener('click', () => {
                costs().splice(Number(button.closest('.pc-custom-row').dataset.costIndex), 1);
                bindCostEditor(type);
                renderPricing();
            });
        });
    }

    function addCostRow(type, { name = '', unit = 'rp', focus = 'name' } = {}) {
        const isMarketplace = type === 'marketplace';
        const costs = isMarketplace ? marketplaceCosts : customCosts;
        if (isMarketplace) marketplaceCostSeq += 1;
        else customCostSeq += 1;
        costs.push({
            id: isMarketplace ? marketplaceCostSeq : customCostSeq,
            name,
            value: '',
            unit
        });
        bindCostEditor(type);
        renderPricing();
        const list = el(isMarketplace ? 'marketplaceCostsList' : 'customCostsList');
        const row = list.lastElementChild;
        const input = row && row.querySelector(focus === 'value' ? '.pc-custom-value' : '.pc-custom-name-input');
        if (input) {
            input.focus();
            input.select();
        }
    }

    function renderCostTotals(result) {
        const marketplace = readCosts('marketplace');
        const custom = readCosts('custom');
        const marketplaceTotal = el('marketplaceCostTotal');
        const customTotal = el('customCostTotal');

        marketplaceTotal.textContent = marketplaceCosts.length
            ? result.price > 0 ? fmtRp(result.marketplaceCostRp)
                : marketplace.fixed > 0 ? fmtRp(marketplace.fixed) : fmtPct(marketplace.pct)
            : '—';
        customTotal.textContent = customCosts.length
            ? result.price > 0 ? fmtRp(result.customCostRp)
                : custom.fixed > 0 ? fmtRp(custom.fixed) : fmtPct(custom.pct)
            : '—';
    }

    function renderHppRange(result, marketplace, custom, profit) {
        const tbody = el('hppTable').querySelector('tbody');
        const rows = calculateHppRange({
            sellingPrice: result.price,
            marketplace,
            custom,
            profit,
            hppMin: parseMoney(inpHppMin.value),
            hppMax: parseMoney(inpHppMax.value),
            ppnEnabled: inpPpn.checked
        });

        tbody.innerHTML = rows.map((row) =>
            '<tr><td>' + fmtRp(row.hpp) + '</td><td>' + fmtRoas(row.minRoas) + '</td><td>' +
            (row.maxAd > 0 ? fmtRp(row.maxAd) : 'Rp0') + '</td></tr>'
        ).join('') || '<tr><td colspan="3" style="text-align:center;color:var(--muted)">Isi HPP min & max</td></tr>';
    }

    function renderPricing() {
        const hpp = parseMoney(inpHpp.value);
        const profit = parseDec(inpProfit.value);
        const roas = parseDec(inpRoas.value);
        const marketplace = readCosts('marketplace');
        const custom = readCosts('custom');
        const result = calculatePricing({
            hpp,
            sellingPrice: parseMoney(inpSelling.value),
            profit,
            roas,
            marketplace,
            custom,
            mode,
            ppnEnabled: inpPpn.checked
        });

        renderCostTotals(result);
        el('pcWarnings').innerHTML = result.warnings.map((warning) =>
            '<div class="pc-warn"><i class="bi bi-exclamation-triangle"></i><span>' + warning + '</span></div>'
        ).join('');

        el('hlLabel').textContent = result.label;
        el('hlValue').textContent = result.hasResult ? fmtRp(result.price) : '—';
        el('hlSub').textContent = mode === 'determine' && result.hasResult
            ? 'Minimal agar target profit ' + profit + '% tercapai dengan ROAS ' + (roas || 0) + 'x'
            : mode === 'analyze' && result.price > 0 ? 'Analisa untuk harga ini' : '';

        const chips = mode === 'determine' && result.hasResult ? suggestPrices(result.price) : [];
        el('hlChips').innerHTML = chips.map((price) =>
            '<button type="button" class="pc-chip" data-price="' + price + '">' + fmtRp(price) + '</button>'
        ).join('');

        if (result.price > 0) {
            const status = statusOf(result.price, hpp, result.netAfterCosts, result.maxAd);
            const labels = { aman: 'AMAN', mepet: 'MEPET', rugi: 'RUGI' };
            const icons = { aman: 'bi-check-circle', mepet: 'bi-exclamation-circle', rugi: 'bi-x-circle' };
            el('statusRow').innerHTML = '<span class="pc-badge ' + status + '"><i class="bi ' +
                icons[status] + '"></i> ' + labels[status] + '</span>';
        } else {
            el('statusRow').innerHTML = '';
        }

        const targetRoas = mode === 'determine' ? roas > 0 ? roas : null : result.minRoas;
        const metrics = [
            { l: 'HPP', v: fmtRp(hpp) },
            { l: 'Biaya Marketplace', v: fmtRp(result.marketplaceCostRp), s: marketplace.pct > 0 ? fmtPct(marketplace.pct) : 'manual' },
            { l: 'Budget Iklan Maksimal', v: result.maxAd > 0 ? fmtRp(result.maxAd) : 'Rp0', s: '/ order' },
            { l: mode === 'determine' ? 'Target ROAS' : 'ROAS Minimum', v: fmtRoas(targetRoas), s: 'sebelum PPN' }
        ];
        if (inpPpn.checked) {
            metrics.push({ l: 'ROAS Setelah PPN 11%', v: fmtRoas(targetRoas === null ? null : targetRoas / adFactor()), s: 'atas biaya riil' });
        }
        metrics.push(
            { l: 'Target Net Profit', v: fmtRp(result.targetProfitRp), s: fmtPct(profit) },
            { l: 'Pendapatan Bersih', v: fmtRp(result.netAfterCosts) },
            { l: 'Break Even ROAS', v: fmtRoas(result.breakEven) }
        );
        if (customCosts.length) {
            metrics.splice(2, 0, { l: 'Biaya Tambahan', v: fmtRp(result.customCostRp), s: customCosts.length + ' item' });
        }
        el('pcMetrics').innerHTML = metrics.map((metric) =>
            '<div class="pc-metric"><div class="m-lbl">' + metric.l + '</div><div class="m-val">' +
            metric.v + '</div>' + (metric.s ? '<div class="m-sub">' + metric.s + '</div>' : '') + '</div>'
        ).join('');

        const activeRoas = mode === 'determine' ? Math.round(roas) : null;
        el('roasTable').querySelector('tbody').innerHTML = (result.price > 0 ? [4, 5, 6, 7, 8, 9, 10] : []).map((level) => {
            const profitOrder = result.price - result.marketplaceCostRp - result.customCostRp -
                hpp - result.price * result.adFactor / level;
            const margin = result.price > 0 ? profitOrder / result.price * 100 : 0;
            return '<tr' + (level === activeRoas ? ' class="hi"' : '') + '><td>' + level +
                'x</td><td>' + fmtRp(profitOrder) + '</td><td>' + margin.toFixed(1) + '%</td></tr>';
        }).join('') || '<tr><td colspan="3" style="text-align:center;color:var(--muted)">Isi HPP untuk melihat simulasi</td></tr>';

        el('roasCap').textContent = inpPpn.checked
            ? 'Biaya iklan sudah termasuk PPN 11% (ROAS = angka platform, sebelum PPN).'
            : 'PPN iklan tidak diperhitungkan.';
        renderHppRange(result, marketplace, custom, profit);
    }

    function setupPricingEvents() {
        [inpHpp, inpSelling, inpHppMin, inpHppMax].forEach((input) => {
            input.addEventListener('input', () => {
                const cursorFromEnd = input.value.length - input.selectionStart;
                input.value = fmtThousand(input.value.replace(/\D/g, ''));
                input.setSelectionRange(
                    Math.max(0, input.value.length - cursorFromEnd),
                    Math.max(0, input.value.length - cursorFromEnd)
                );
                renderPricing();
            });
            input.addEventListener('focus', () => input.select());
        });

        [inpProfit, inpRoas].forEach((input) => {
            input.addEventListener('input', () => {
                normalizeDecimalInput(input);
                renderPricing();
            });
            input.addEventListener('focus', () => input.select());
        });

        document.querySelectorAll('.pc-presets').forEach((group) => {
            const targetId = group.dataset.presetFor;
            group.querySelectorAll('.pc-preset').forEach((button) => {
                button.addEventListener('click', () => {
                    setInputValue(el(targetId), button.dataset.val);
                    group.querySelectorAll('.pc-preset').forEach((item) => item.classList.remove('active'));
                    button.classList.add('active');
                    renderPricing();
                });
            });
        });

        el('addMarketplaceCost').addEventListener('click', () => addCostRow('marketplace'));
        el('addCustomCost').addEventListener('click', () => addCostRow('custom'));
        document.querySelectorAll('[data-marketplace-preset]').forEach((button) => {
            button.addEventListener('click', () => addCostRow('marketplace', {
                name: button.dataset.marketplacePreset,
                unit: button.dataset.marketplacePresetUnit,
                focus: 'value'
            }));
        });

        document.querySelectorAll('.pc-modes button').forEach((button) => {
            button.addEventListener('click', () => {
                mode = button.dataset.mode;
                document.querySelectorAll('.pc-modes button').forEach((item) => item.classList.remove('active'));
                button.classList.add('active');
                body.className = 'pc-body mode-' + mode;
                renderPricing();
            });
        });

        el('hlChips').addEventListener('click', (event) => {
            const chip = event.target.closest('.pc-chip');
            if (!chip) return;
            inpSelling.value = fmtThousand(chip.dataset.price);
            document.querySelector('.pc-modes button[data-mode="analyze"]').click();
        });
        inpPpn.addEventListener('change', renderPricing);
        el('rangeToggle').addEventListener('click', () => {
            const panel = el('rangePanel');
            panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
        });
        [inpHppMin, inpHppMax].forEach((input) => input.addEventListener('input', renderPricing));
    }

    const storeState = { editingId: null };
    let databaseShipmentStores = null;

    function setStoreStatus(message, type = '') {
        const status = el('storeStatus');
        if (!status) return;
        status.hidden = !message;
        status.className = 'store-status' + (type ? ' ' + type : '');
        status.textContent = message || '';
    }

    function renderStoreOptions() {
        const selected = shipment.store ? shipment.store.value : '';
        const availableStores = databaseShipmentStores?.length ? databaseShipmentStores : stores;
        shipment.store.innerHTML = '<option value="">Pilih toko</option>' + availableStores.map((store) =>
            '<option value="' + escapeHtml(store.name) + '">' + escapeHtml(store.name) + '</option>'
        ).join('');
        shipment.store.value = availableStores.some((store) => store.name === selected) ? selected : '';
    }

    function renderStoreList() {
        const body = el('storeTableBody');
        const empty = el('storeEmptyState');
        const count = el('storeCount');
        if (!body || !empty) return;

        count.textContent = stores.length + (stores.length === 1 ? ' toko' : ' toko');
        empty.hidden = stores.length > 0;
        body.innerHTML = stores.map((store) =>
            '<tr>' +
                '<td><strong>' + escapeHtml(store.name) + '</strong>' +
                    (store.description ? '<span class="store-description">' + escapeHtml(store.description) + '</span>' : '') +
                '</td>' +
                '<td>' + (escapeHtml(store.username) || '<span class="store-muted">—</span>') + '</td>' +
                '<td>' + (escapeHtml(store.shopId) || '<span class="store-muted">—</span>') + '</td>' +
                '<td><span class="store-active"><i class="bi bi-check-circle-fill"></i> Aktif</span></td>' +
                '<td class="store-actions-cell">' +
                    '<button type="button" class="store-icon-btn" data-store-edit="' + store.id + '" aria-label="Edit ' + escapeHtml(store.name) + '" title="Edit toko"><i class="bi bi-pencil"></i></button>' +
                    '<button type="button" class="store-icon-btn danger" data-store-delete="' + store.id + '" aria-label="Hapus ' + escapeHtml(store.name) + '" title="Hapus toko"><i class="bi bi-trash3"></i></button>' +
                '</td>' +
            '</tr>'
        ).join('');
    }

    function resetStoreForm() {
        storeState.editingId = null;
        el('storeForm').reset();
        el('storeFormTitle').textContent = 'Tambah toko';
        el('storeFormDescription').textContent = 'Simpan identitas toko untuk dipakai di workspace.';
        el('storeSubmitBtn').innerHTML = '<i class="bi bi-plus-lg"></i> Simpan toko';
        el('storeCancelBtn').hidden = true;
        setStoreStatus('');
    }

    function editStore(id) {
        const store = stores.find((item) => String(item.id) === String(id));
        if (!store) return;
        storeState.editingId = store.id;
        el('storeName').value = store.name;
        el('storeUsername').value = store.username || '';
        el('storeShopId').value = store.shopId || '';
        el('storeDescription').value = store.description || '';
        el('storeFormTitle').textContent = 'Edit toko';
        el('storeFormDescription').textContent = 'Perbarui informasi toko lalu simpan perubahan.';
        el('storeSubmitBtn').innerHTML = '<i class="bi bi-check2"></i> Update toko';
        el('storeCancelBtn').hidden = false;
        setStoreStatus('');
        el('storeName').focus();
    }

    function deleteStore(id) {
        const store = stores.find((item) => String(item.id) === String(id));
        if (!store || !window.confirm('Hapus ' + store.name + '? Data pengiriman yang sudah tersimpan tidak ikut terhapus.')) return;
        stores = stores.filter((item) => String(item.id) !== String(id));
        saveStores();
        renderStoreList();
        renderStoreOptions();
        if (String(storeState.editingId) === String(id)) resetStoreForm();
        setStoreStatus('Toko berhasil dihapus.', 'success');
    }

    function setupStoreEvents() {
        const form = el('storeForm');
        if (!form) return;
        renderStoreList();
        renderStoreOptions();
        form.addEventListener('submit', (event) => {
            event.preventDefault();
            const name = el('storeName').value.trim();
            if (!name) {
                setStoreStatus('Nama toko wajib diisi.', 'error');
                el('storeName').focus();
                return;
            }
            const duplicate = stores.find((store) => store.name.toLowerCase() === name.toLowerCase() &&
                String(store.id) !== String(storeState.editingId));
            if (duplicate) {
                setStoreStatus('Nama toko tersebut sudah ada.', 'error');
                el('storeName').focus();
                return;
            }
            const payload = {
                name,
                username: el('storeUsername').value.trim(),
                shopId: el('storeShopId').value.trim(),
                description: el('storeDescription').value.trim(),
                updatedAt: new Date().toISOString()
            };
            const wasEditing = storeState.editingId !== null;
            if (!wasEditing) {
                stores.push({ id: Date.now(), ...payload });
            } else {
                const index = stores.findIndex((store) => String(store.id) === String(storeState.editingId));
                if (index !== -1) stores[index] = { ...stores[index], ...payload };
            }
            saveStores();
            renderStoreList();
            renderStoreOptions();
            resetStoreForm();
            setStoreStatus(wasEditing ? 'Perubahan toko berhasil diupdate.' : 'Toko berhasil ditambahkan.', 'success');
        });
        el('storeCancelBtn').addEventListener('click', resetStoreForm);
        el('storeNewBtn').addEventListener('click', () => {
            resetStoreForm();
            el('storeName').focus();
        });
        el('storeTableBody').addEventListener('click', (event) => {
            const editButton = event.target.closest('[data-store-edit]');
            const deleteButton = event.target.closest('[data-store-delete]');
            if (editButton) editStore(editButton.dataset.storeEdit);
            if (deleteButton) deleteStore(deleteButton.dataset.storeDelete);
        });
    }

    const shipmentState = {
        files: [],
        rows: [],
        readyRows: [],
        duplicateCount: 0,
        totalCount: 0,
        confirmed: false
    };
    const shipment = {
        store: el('shipmentStore'),
        filesInput: el('shipmentFiles'),
        dropzone: el('shipmentDropzone'),
        fileList: el('shipmentFileList'),
        previewButton: el('shipmentPreviewBtn'),
        resetButton: el('shipmentReset'),
        status: el('shipmentStatus'),
        emptyState: el('shipmentEmptyState'),
        previewState: el('shipmentPreviewState'),
        previewBody: el('shipmentPreviewBody'),
        confirmButton: el('shipmentConfirmBtn')
    };

    const incomeState = { file: null, parsed: null, confirmed: false };
    const income = {
        store: el('incomeStore'),
        filesInput: el('incomeFiles'),
        dropzone: el('incomeDropzone'),
        fileList: el('incomeFileList'),
        previewButton: el('incomePreviewBtn'),
        resetButton: el('incomeReset'),
        status: el('incomeStatus'),
        emptyState: el('incomeEmptyState'),
        previewState: el('incomePreviewState'),
        auditChecks: el('incomeAuditChecks'),
        reportRows: el('incomeReportRows'),
        previewBody: el('incomePreviewBody'),
        confirmButton: el('incomeConfirmBtn')
    };

    function setShipmentStatus(message, type) {
        shipment.status.hidden = !message;
        shipment.status.className = 'shipment-status' + (type ? ' ' + type : '');
        shipment.status.textContent = message || '';
    }

    function renderShipmentFiles() {
        shipment.fileList.innerHTML = shipmentState.files.map((file, index) =>
            '<div class="shipment-file"><div class="shipment-file-copy"><i class="bi bi-file-earmark-check"></i>' +
            '<span class="shipment-file-name" title="' + shipmentEscape(file.name) + '">' + shipmentEscape(file.name) +
            '</span></div><span class="shipment-file-size">' + shipmentFormatSize(file.size) +
            '</span><button type="button" class="shipment-remove" data-file-index="' + index +
            '" aria-label="Hapus file"><i class="bi bi-x-lg"></i></button></div>'
        ).join('');
        shipment.previewButton.disabled = !shipment.store.value || !shipmentState.files.length;
        shipment.resetButton.disabled = !shipmentState.files.length && !shipmentState.rows.length;
    }

    function resetShipmentPreview() {
        shipmentState.rows = [];
        shipmentState.readyRows = [];
        shipmentState.duplicateCount = 0;
        shipmentState.totalCount = 0;
        shipmentState.confirmed = false;
        shipment.previewState.hidden = true;
        shipment.emptyState.hidden = false;
        shipment.confirmButton.disabled = true;
        shipment.confirmButton.innerHTML = '<i class="bi bi-database-check"></i> Simpan ke database';
        shipment.previewBody.innerHTML = '';
    }

    function renderShipmentPreview() {
        const visibleRows = shipmentState.readyRows.slice(0, 100);
        el('shipmentTotalCount').textContent = shipmentState.totalCount.toLocaleString('id-ID');
        el('shipmentReadyCount').textContent = shipmentState.readyRows.length.toLocaleString('id-ID');
        el('shipmentDuplicateCount').textContent = shipmentState.duplicateCount.toLocaleString('id-ID');
        el('shipmentFileCount').textContent = shipmentState.files.length.toLocaleString('id-ID');
        el('shipmentPreviewDescription').textContent = shipment.store.value + ' · ' + shipmentState.files.length +
            ' file · maksimal 100 baris ditampilkan';
        shipment.previewBody.innerHTML = visibleRows.map((row) =>
            '<tr><td title="' + shipmentEscape(row.orderId) + '">' + (shipmentEscape(row.orderId) || '—') +
            '</td><td>' + (shipmentEscape(row.item) || '—') +
            '</td><td title="' + shipmentEscape(row.productTitle) + '">' + (shipmentEscape(row.productTitle) || '—') +
            '</td><td title="' + shipmentEscape(row.variant) + '">' + (shipmentEscape(row.variant) || '—') +
            '</td><td title="' + shipmentEscape(row.sku) + '">' + (shipmentEscape(row.sku) || '—') +
            '</td><td title="' + shipmentEscape(row.skuId) + '">' + (shipmentEscape(row.skuId) || '—') +
            '</td><td title="' + shipmentEscape(row.tracking) + '">' + (shipmentEscape(row.tracking) || '—') +
            '</td><td>' + (shipmentEscape(row.courier) || '—') + '</td><td><span class="shipment-pill">' +
            (shipmentEscape(row.status) || 'Belum ada status') + '</span></td><td>' +
            shipmentFormatAmount(row.total) + '</td></tr>'
        ).join('') || '<tr><td colspan="10" class="muted" style="text-align:center;padding:2rem">' +
        'Tidak ada baris unik baru untuk diimpor.</td></tr>';
        shipment.emptyState.hidden = true;
        shipment.previewState.hidden = false;
        shipment.confirmButton.disabled = !shipmentState.rows.length || shipmentState.confirmed;
    }

    async function buildShipmentPreview() {
        if (!shipment.store.value) {
            setShipmentStatus('Pilih toko tujuan terlebih dahulu.', 'error');
            return;
        }
        if (!shipmentState.files.length) {
            setShipmentStatus('Pilih minimal satu file XLSX atau CSV.', 'error');
            return;
        }

        shipment.previewButton.disabled = true;
        shipment.previewButton.innerHTML = '<i class="bi bi-arrow-repeat"></i> Membaca file...';
        setShipmentStatus('Sedang memeriksa struktur kolom dan duplikasi data…');
        resetShipmentPreview();

        try {
            const parsedRows = [];
            for (const file of shipmentState.files) {
                parsedRows.push(...await parseShipmentFile(file));
            }
            const stored = readShipmentRecords();
            const unique = getUniqueShipmentRows(parsedRows, shipment.store.value, stored);
            shipmentState.rows = parsedRows;
            shipmentState.readyRows = unique.uniqueRows;
            shipmentState.duplicateCount = unique.duplicateCount;
            shipmentState.totalCount = parsedRows.length;
            renderShipmentPreview();
            setShipmentStatus(
                'Preview siap.' + (unique.duplicateCount
                    ? ' ' + unique.duplicateCount + ' duplikat dikeluarkan.'
                    : ' Tidak ada duplikat ditemukan.'),
                'success'
            );
        } catch (error) {
            resetShipmentPreview();
            setShipmentStatus('File tidak bisa dibaca: ' + (error.message || 'format tidak sesuai.'), 'error');
        } finally {
            shipment.previewButton.disabled = !shipment.store.value || !shipmentState.files.length;
            shipment.previewButton.innerHTML = '<i class="bi bi-eye"></i> Preview data';
            renderShipmentFiles();
        }
    }

    function addShipmentFiles(files) {
        const valid = files.filter((file) => /\.(xlsx|csv)$/i.test(file.name));
        const existing = new Set(shipmentState.files.map((file) => file.name + '|' + file.size + '|' + file.lastModified));
        valid.forEach((file) => {
            const key = file.name + '|' + file.size + '|' + file.lastModified;
            if (!existing.has(key)) {
                shipmentState.files.push(file);
                existing.add(key);
            }
        });
        setShipmentStatus(valid.length === files.length ? '' : 'Hanya file XLSX dan CSV yang diterima.', valid.length === files.length ? '' : 'error');
        resetShipmentPreview();
        renderShipmentFiles();
    }

    function setupShipmentEvents() {
        shipment.filesInput.addEventListener('change', (event) => {
            addShipmentFiles(Array.from(event.target.files || []));
            event.target.value = '';
        });
        shipment.fileList.addEventListener('click', (event) => {
            const button = event.target.closest('[data-file-index]');
            if (!button) return;
            shipmentState.files.splice(Number(button.dataset.fileIndex), 1);
            resetShipmentPreview();
            renderShipmentFiles();
        });
        shipment.store.addEventListener('change', () => {
            resetShipmentPreview();
            setShipmentStatus('');
            renderShipmentFiles();
        });
        shipment.previewButton.addEventListener('click', buildShipmentPreview);
        shipment.resetButton.addEventListener('click', () => {
            shipmentState.files = [];
            resetShipmentPreview();
            setShipmentStatus('');
            renderShipmentFiles();
        });
        shipment.dropzone.addEventListener('dragover', (event) => {
            event.preventDefault();
            shipment.dropzone.classList.add('is-dragging');
        });
        shipment.dropzone.addEventListener('dragleave', () => shipment.dropzone.classList.remove('is-dragging'));
        shipment.dropzone.addEventListener('drop', (event) => {
            event.preventDefault();
            shipment.dropzone.classList.remove('is-dragging');
            addShipmentFiles(Array.from(event.dataTransfer.files || []));
        });
        shipment.confirmButton.addEventListener('click', async () => {
            if (!shipmentState.rows.length || shipmentState.confirmed) return;
            const selectedStore = databaseShipmentStores?.find((store) => store.name === shipment.store.value);
            if (!selectedStore) {
                setShipmentStatus('Toko database belum siap. Muat ulang halaman lalu coba lagi.', 'error');
                return;
            }

            shipment.confirmButton.disabled = true;
            shipment.confirmButton.innerHTML = '<i class="bi bi-arrow-repeat"></i> Menyimpan...';
            setShipmentStatus('Sedang menyimpan pesanan, resi, item, dan pencocokan transaksi ke database…');
            try {
                const response = await fetch('/api/shipment-imports', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        storeId: selectedStore.id,
                        fileName: shipmentState.files.map((file) => file.name).join(', '),
                        rows: shipmentState.rows
                    })
                });
                const payload = await response.json().catch(() => ({}));
                if (!response.ok) throw new Error(payload.message || 'Server tidak dapat menyimpan data pengiriman.');

                const stored = readShipmentRecords();
                const additions = shipmentState.readyRows.map((row) => ({
                    ...row,
                    store: shipment.store.value,
                    importedAt: new Date().toISOString()
                }));
                saveShipmentRecords(stored.concat(additions));
                const result = payload.data || {};
                shipmentState.confirmed = true;
                shipment.confirmButton.disabled = true;
                shipment.confirmButton.innerHTML = '<i class="bi bi-check2"></i> Tersimpan ke database';
                setShipmentStatus(
                    (result.importedCount || shipmentState.rows.length) + ' baris tersimpan untuk ' + shipment.store.value + '. ' +
                    (result.createdOrderCount || 0) + ' pesanan baru dan ' +
                    (result.linkedTransactionCount || 0) + ' transaksi keuangan dicocokkan.',
                    'success'
                );
            } catch (error) {
                shipment.confirmButton.disabled = false;
                shipment.confirmButton.innerHTML = '<i class="bi bi-database-check"></i> Simpan ke database';
                setShipmentStatus(error.message || 'Data pengiriman tidak bisa disimpan. Coba lagi.', 'error');
            }
        });
        renderShipmentFiles();
        loadDatabaseShipmentStore();
    }

    function setIncomeStatus(message, type = '') {
        income.status.hidden = !message;
        income.status.className = 'income-status' + (type ? ' ' + type : '');
        income.status.textContent = message || '';
    }

    function renderIncomeStores(stores = databaseShipmentStores || []) {
        const selected = income.store?.value || '';
        income.store.innerHTML = '<option value="">Pilih toko</option>' + stores.map((store) =>
            '<option value="' + escapeIncomeHtml(store.id) + '">' + escapeIncomeHtml(store.name) + '</option>'
        ).join('');
        income.store.value = stores.some((store) => String(store.id) === String(selected)) ? selected : (stores[0] ? String(stores[0].id) : '');
    }

    function renderIncomeFile() {
        income.fileList.innerHTML = incomeState.file
            ? '<div class="income-file"><i class="bi bi-file-earmark-check"></i><span title="' + escapeIncomeHtml(incomeState.file.name) + '">' + escapeIncomeHtml(incomeState.file.name) + '</span><button type="button" id="incomeRemoveFile" aria-label="Hapus file"><i class="bi bi-x-lg"></i></button></div>'
            : '';
        income.previewButton.disabled = !income.store.value || !incomeState.file;
        income.resetButton.disabled = !incomeState.file && !incomeState.parsed;
    }

    function resetIncomePreview() {
        incomeState.parsed = null;
        incomeState.confirmed = false;
        income.emptyState.hidden = false;
        income.previewState.hidden = true;
        income.confirmButton.disabled = true;
        income.confirmButton.innerHTML = '<i class="bi bi-database-check"></i> Import ke database';
        income.auditChecks.innerHTML = '';
        income.reportRows.innerHTML = '';
        income.previewBody.innerHTML = '';
    }

    function renderIncomePreview() {
        const parsed = incomeState.parsed;
        const audit = parsed.audit;
        const number = (value) => Number(value || 0).toLocaleString('id-ID');
        el('incomePreviewDescription').textContent = parsed.fileName + ' · ' + number(audit.detailRows) + ' baris detail · ' + number(audit.withdrawalRows) + ' transfer';
        el('incomeDetailCount').textContent = number(audit.detailRows);
        el('incomeOrderCount').textContent = number(audit.orderRows);
        el('incomeAdjustmentCount').textContent = number(audit.adjustmentRows);
        el('incomeDuplicateCount').textContent = number(audit.duplicateRows);
        el('incomeErrorCount').textContent = number(audit.invalidRows);
        income.auditChecks.innerHTML = audit.checks.map((check) =>
            '<div class="income-check ' + check.status + '"><i class="bi ' + (check.status === 'ok' ? 'bi-check-circle-fill' : check.status === 'warning' ? 'bi-exclamation-triangle-fill' : 'bi-x-circle-fill') + '"></i><span><strong>' + escapeIncomeHtml(check.label) + '</strong><small>' + escapeIncomeHtml(check.detail) + '</small></span></div>'
        ).join('');
        const reportEntries = Object.entries(audit.report || {}).filter(([key]) => [
            'Periode', 'Zona waktu', 'Mata uang', 'Jumlah penyelesaian pembayaran', 'Total Pendapatan', 'Total Biaya',
            'Total pengembalian dana setelah diskon', 'Biaya komisi platform', 'Biaya layanan logistik', 'Ongkir'
        ].includes(key));
        income.reportRows.innerHTML = reportEntries.map(([label, value]) =>
            '<div><span>' + escapeIncomeHtml(label) + '</span><strong>' + (label === 'Periode' || label === 'Zona waktu' || label === 'Mata uang' ? escapeIncomeHtml(value) : formatIncomeAmount(value)) + '</strong></div>'
        ).join('') || '<div><span>Ringkasan</span><strong>Tidak tersedia</strong></div>';
        income.previewBody.innerHTML = parsed.previewRows.map(({ row, sourceRow }) =>
            '<tr><td class="muted">' + number(sourceRow) + '</td><td>' + escapeIncomeHtml(row['ID Pesanan/Penyesuaian']) + '</td><td>' + escapeIncomeHtml(row['Jenis transaksi']) + '</td><td>' + escapeIncomeHtml(row['Waktu pemesanan']) + '</td><td>' + escapeIncomeHtml(row['Waktu pembayaran pesanan']) + '</td><td class="numeric">' + formatIncomeAmount(row['Jumlah penyelesaian pembayaran']) + '</td><td class="numeric">' + formatIncomeAmount(row['Total Pendapatan']) + '</td><td class="numeric">' + formatIncomeAmount(row['Total Biaya']) + '</td></tr>'
        ).join('') || '<tr><td colspan="8" class="muted" style="text-align:center;padding:2rem">Tidak ada transaksi yang dapat ditampilkan.</td></tr>';
        income.emptyState.hidden = true;
        income.previewState.hidden = false;
        income.confirmButton.disabled = !audit.ready || incomeState.confirmed;
    }

    async function buildIncomePreview() {
        if (!income.store.value) {
            setIncomeStatus('Pilih toko tujuan terlebih dahulu.', 'error');
            return;
        }
        if (!incomeState.file) {
            setIncomeStatus('Pilih satu file laporan income XLSX.', 'error');
            return;
        }
        income.previewButton.disabled = true;
        income.previewButton.innerHTML = '<i class="bi bi-arrow-repeat"></i> Memeriksa...';
        setIncomeStatus('Sedang membaca sheet dan menjalankan audit rekonsiliasi…');
        resetIncomePreview();
        try {
            incomeState.parsed = await parseIncomeFile(incomeState.file);
            renderIncomePreview();
            const warningCount = incomeState.parsed.audit.checks.filter((check) => check.status !== 'ok').length;
            setIncomeStatus(warningCount ? 'Audit selesai dengan ' + warningCount + ' catatan. Tinjau checklist sebelum import.' : 'Audit selesai. File siap diimpor.', warningCount ? '' : 'success');
        } catch (error) {
            resetIncomePreview();
            setIncomeStatus('File tidak bisa dibaca: ' + (error.message || 'format tidak sesuai.'), 'error');
        } finally {
            income.previewButton.disabled = !income.store.value || !incomeState.file;
            income.previewButton.innerHTML = '<i class="bi bi-search"></i> Cek &amp; audit';
            renderIncomeFile();
        }
    }

    function addIncomeFile(file) {
        if (!file) return;
        if (!/\.xlsx$/i.test(file.name)) {
            setIncomeStatus('Hanya file XLSX yang diterima.', 'error');
            return;
        }
        incomeState.file = file;
        resetIncomePreview();
        setIncomeStatus('');
        renderIncomeFile();
    }

    function setupIncomeEvents() {
        income.filesInput.addEventListener('change', (event) => {
            addIncomeFile(event.target.files?.[0]);
            event.target.value = '';
        });
        income.fileList.addEventListener('click', (event) => {
            if (!event.target.closest('#incomeRemoveFile')) return;
            incomeState.file = null;
            resetIncomePreview();
            renderIncomeFile();
        });
        income.store.addEventListener('change', () => {
            resetIncomePreview();
            renderIncomeFile();
        });
        income.previewButton.addEventListener('click', buildIncomePreview);
        income.resetButton.addEventListener('click', () => {
            incomeState.file = null;
            resetIncomePreview();
            setIncomeStatus('');
            renderIncomeFile();
        });
        income.dropzone.addEventListener('dragover', (event) => {
            event.preventDefault();
            income.dropzone.classList.add('is-dragging');
        });
        income.dropzone.addEventListener('dragleave', () => income.dropzone.classList.remove('is-dragging'));
        income.dropzone.addEventListener('drop', (event) => {
            event.preventDefault();
            income.dropzone.classList.remove('is-dragging');
            addIncomeFile(Array.from(event.dataTransfer.files || [])[0]);
        });
        income.confirmButton.addEventListener('click', async () => {
            if (!incomeState.parsed || !incomeState.parsed.audit.ready || incomeState.confirmed) return;
            income.confirmButton.disabled = true;
            income.confirmButton.innerHTML = '<i class="bi bi-arrow-repeat"></i> Menyimpan...';
            setIncomeStatus('Sedang menyimpan transaksi keuangan dan catatan audit…');
            try {
                const response = await fetch('/api/income-imports', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        storeId: Number(income.store.value),
                        fileName: incomeState.parsed.fileName,
                        details: incomeState.parsed.details,
                        withdrawals: incomeState.parsed.withdrawals,
                        report: incomeState.parsed.report
                    })
                });
                const payload = await response.json().catch(() => ({}));
                if (!response.ok) throw new Error(payload.message || 'Server tidak dapat menyimpan laporan keuangan.');
                const result = payload.data || {};
                incomeState.confirmed = true;
                income.confirmButton.innerHTML = '<i class="bi bi-check2"></i> Tersimpan ke database';
                setIncomeStatus(result.status === 'already_imported' ? 'File yang sama sudah tercatat sebelumnya.' : (result.importedCount || 0) + ' baris keuangan tersimpan. ' + (result.duplicateCount || 0) + ' duplikat dicatat sebagai review.', 'success');
                await refreshWorkspace(Number(income.store.value));
            } catch (error) {
                income.confirmButton.disabled = false;
                income.confirmButton.innerHTML = '<i class="bi bi-database-check"></i> Import ke database';
                setIncomeStatus(error.message || 'Laporan keuangan tidak bisa disimpan.', 'error');
            }
        });
        renderIncomeFile();
        renderIncomeStores();
    }

    async function loadDatabaseShipmentStore() {
        if (!shipment.store) return;
        shipment.store.disabled = true;
        shipment.store.innerHTML = '<option value="">Memuat toko database…</option>';
        try {
            const response = await fetch('/api/workspace');
            const data = await response.json();
            if (!response.ok || !Array.isArray(data.stores) || !data.stores.length) throw new Error('Toko database belum tersedia.');
            databaseShipmentStores = data.stores.map((store) => ({ id: store.id, name: store.name }));
            renderStoreOptions();
            renderIncomeStores(databaseShipmentStores);
            shipment.store.value = databaseShipmentStores[0].name;
        } catch (_) {
            databaseShipmentStores = null;
            renderStoreOptions();
        } finally {
            shipment.store.disabled = false;
            renderShipmentFiles();
        }
    }

    function setupTheme() {
        el('themeToggle').addEventListener('click', () => {
            const dark = document.body.dataset.theme !== 'dark';
            document.body.dataset.theme = dark ? 'dark' : 'light';
            el('themeToggle').innerHTML = dark
                ? '<i class="bi bi-sun"></i> Tema'
                : '<i class="bi bi-moon-stars"></i> Tema';
        });
    }

    function setupNavigation() {
        const pageTitle = el('pageTitle');
        const pageSubtitle = el('pageSubtitle');
        const pageViews = document.querySelectorAll('[data-page-view]');
        const toggle = el('sidebarToggle');

        function closeSidebar() {
            document.body.classList.remove('sidebar-open');
            toggle.setAttribute('aria-expanded', 'false');
            toggle.setAttribute('aria-label', 'Buka navigasi');
        }

        function showPage(page) {
            renderPage({
                page,
                pageViews,
                navButtons: document.querySelectorAll('.app-nav [data-page-target]'),
                pageTitle,
                pageSubtitle,
                meta: pageMeta[page] || pageMeta.dashboard
            });
            if (page === 'pricing') renderPricing();
            if (page === 'incomeImport') renderIncomeFile();
            if (page === 'shipmentImport') renderShipmentFiles();
            if (page === 'stores') renderStoreList();
            if (['products', 'variants', 'orderMapping'].includes(page)) renderCatalogPage(page);
            if (page === 'promotions') renderPromotions();
            if (page === 'finance' && document.querySelector('#financeKpis')?.innerHTML) {
                refreshWorkspace();
            }
            closeSidebar();
        }

        toggle.addEventListener('click', () => {
            const isOpen = document.body.classList.toggle('sidebar-open');
            toggle.setAttribute('aria-expanded', String(isOpen));
            toggle.setAttribute('aria-label', isOpen ? 'Tutup navigasi' : 'Buka navigasi');
        });
        el('sidebarBackdrop').addEventListener('click', closeSidebar);
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') closeSidebar();
        });

        document.querySelectorAll('[data-page-target]').forEach((button) => {
            button.addEventListener('click', (event) => {
                event.preventDefault();
                const page = button.dataset.pageTarget;
                history.pushState({}, '', pageRoutes[page] || pageRoutes.dashboard);
                showPage(page);
            });
        });
        window.addEventListener('popstate', () => showPage(pageFromPath(window.location.pathname)));
        const initialPage = pageFromPath(window.location.pathname);
        if (initialPage === 'finance' && window.location.pathname.replace(/\/$/, '') === '/keuangan') {
            history.replaceState({}, '', pageRoutes.finance);
        }
        showPage(initialPage);
    }

    bindCostEditor('marketplace');
    bindCostEditor('custom');
    setupPricingEvents();
    setupShipmentEvents();
    setupIncomeEvents();
    setupStoreEvents();
    setupCatalog();
    setupPromotions();
    setupTheme();
    setupWorkspace();
    renderPricing();
    setupNavigation();
})();
