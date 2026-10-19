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
                    <a class="active" href="#overview">Ringkasan</a>
                    <a href="#orders">Pesanan</a>
                    <a href="#imports">Import data</a>
                    <a href="#stores">Toko</a>
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
