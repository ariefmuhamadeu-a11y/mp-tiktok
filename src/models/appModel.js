export const pageRoutes = {
    dashboard: '/',
    orders: '/pesanan',
    finance: '/keuangan',
    pricing: '/penentuan-harga',
    shipmentImport: '/import-pengiriman',
    stores: '/toko'
};

export const pageMeta = {
    dashboard: {
        title: 'Dashboard',
        subtitle: 'Ringkasan pesanan, pengiriman, dan pencairan'
    },
    orders: {
        title: 'Pesanan & Pengiriman',
        subtitle: 'Pantau item, SKU, resi, dan status dana per pesanan'
    },
    finance: {
        title: 'Keuangan',
        subtitle: 'Rekonsiliasi dana masuk saldo dan riwayat pencairan'
    },
    pricing: {
        title: 'Penentuan Harga',
        subtitle: 'Tentukan harga jual, biaya marketplace, profit, dan target ROAS'
    },
    shipmentImport: {
        title: 'Import Pengiriman',
        subtitle: 'Preview dan validasi data sebelum disimpan'
    },
    stores: {
        title: 'Toko',
        subtitle: 'Tambah, edit, dan kelola data toko'
    }
};

export function pageFromPath(pathname = window.location.pathname) {
    const path = pathname.replace(/\/$/, '') || '/';
    return Object.entries(pageRoutes).find(([, route]) => route === path)?.[0] || 'dashboard';
}
