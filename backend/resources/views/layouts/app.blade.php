<!doctype html>
<html lang="id">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="description" content="Dashboard order, pengiriman, transaksi, dan import MP-TikTok.">
    <title>@yield('title', 'MP-TikTok Workspace')</title>
    <link rel="stylesheet" href="{{ asset('css/app.css') }}">
</head>
<body>
    @php
        $navigation = [
            ['label' => 'Ringkasan', 'route' => 'dashboard'],
            ['label' => 'Pesanan', 'route' => 'orders.index'],
            ['label' => 'Pengiriman', 'route' => 'shipping.index'],
            ['label' => 'Transaksi', 'route' => 'finance.index'],
            ['label' => 'Promosi', 'route' => 'promotions.index'],
            ['label' => 'Penentuan Harga', 'route' => 'pricing.index'],
            ['label' => 'Import Keuangan', 'route' => 'imports.income.index'],
            ['label' => 'Import Pengiriman', 'route' => 'imports.shipment.index'],
            ['label' => 'Toko', 'route' => 'stores.index'],
            ['label' => 'Produk', 'route' => 'products.index'],
            ['label' => 'Produk Variant', 'route' => 'variants.index'],
            ['label' => 'Mapping Pesanan', 'route' => 'mapping.index'],
        ];
    @endphp
    <div class="shell">
        <header class="topbar">
            <a class="brand" href="{{ route('dashboard') }}">
                <span class="brand-mark">MP</span>
                <span><strong>MP-TikTok</strong><small>Commerce workspace</small></span>
            </a>
            <div class="topbar-meta"><span class="online-dot"></span> Laravel Blade aktif</div>
        </header>

        <div class="page-grid">
            <aside class="sidebar">
                <p class="eyebrow">Workspace</p>
                <nav class="nav-list" aria-label="Navigasi utama">
                    @foreach ($navigation as $item)
                        <a class="{{ request()->routeIs($item['route']) ? 'active' : '' }}" href="{{ route($item['route']) }}">{{ $item['label'] }}</a>
                    @endforeach
                </nav>
                <div class="sidebar-note">
                    <strong>Mode server-side</strong>
                    <p>Halaman ini dirender Laravel Blade. Tidak membutuhkan Vite atau npm saat dijalankan.</p>
                </div>
            </aside>

            <main class="content">
                @if (session('success'))
                    <div class="flash success">{{ session('success') }}</div>
                @endif
                @if (session('error'))
                    <div class="flash error">{{ session('error') }}</div>
                @endif
                @if ($errors->any())
                    <div class="flash error">
                        <strong>Periksa input:</strong>
                        <ul>
                            @foreach ($errors->all() as $error)
                                <li>{{ $error }}</li>
                            @endforeach
                        </ul>
                    </div>
                @endif

                @yield('content')
            </main>
        </div>
    </div>
</body>
</html>
