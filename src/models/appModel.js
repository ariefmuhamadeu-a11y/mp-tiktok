export const pageRoutes = {
    dashboard: '/',
    orders: '/pesanan',
    shipping: '/pengiriman',
    finance: '/transaksi',
    promotions: '/promosi',
    pricing: '/penentuan-harga',
    incomeImport: '/import-keuangan',
    shipmentImport: '/import-pengiriman',
    stores: '/toko',
    products: '/produk',
    variants: '/produk-variant',
    orderMapping: '/mapping-pesanan'
};

export const pageMeta = {
    dashboard: {
        title: 'Dashboard',
        subtitle: 'Pusat kendali pesanan, pengiriman, transaksi, dan katalog'
    },
    orders: {
        title: 'Pesanan',
        subtitle: 'Order, item, dan AOV penjualan'
    },
    shipping: {
        title: 'Pengiriman',
        subtitle: 'Pantau status paket, resi, dan waktu pengiriman'
    },
    finance: {
        title: 'Transaksi',
        subtitle: 'Penjualan, biaya, pencairan, dan rekonsiliasi'
    },
    promotions: {
        title: 'Promosi',
        subtitle: 'Kelola voucher, bundle, paket, dan campaign penjualan'
    },
    pricing: {
        title: 'Penentuan Harga',
        subtitle: 'Tentukan harga jual, biaya marketplace, profit, dan target ROAS'
    },
    incomeImport: {
        title: 'Import Keuangan & Audit',
        subtitle: 'Import laporan income, cek rekonsiliasi, dan simpan transaksi'
    },
    shipmentImport: {
        title: 'Import Pengiriman',
        subtitle: 'Preview lalu simpan data pengiriman ke database'
    },
    stores: {
        title: 'Toko',
        subtitle: 'Tambah, edit, dan kelola data toko'
    },
    products: {
        title: 'Produk',
        subtitle: 'Master produk internal dan relasi ke variant'
    },
    variants: {
        title: 'Produk Variant',
        subtitle: 'Kelola SKU internal dan atribut variant produk'
    },
    orderMapping: {
        title: 'Mapping Pesanan Marketplace',
        subtitle: 'Hubungkan SKU marketplace ke produk dan variant internal'
    }
};

export function pageFromPath(pathname = window.location.pathname) {
    const path = pathname.replace(/\/$/, '') || '/';
    if (path === '/keuangan') return 'finance';
    return Object.entries(pageRoutes).find(([, route]) => route === path)?.[0] || 'dashboard';
}
