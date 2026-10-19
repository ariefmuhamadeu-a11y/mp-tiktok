@extends('layouts.app')

@php
    $rupiah = static fn ($value): string => 'Rp'.number_format((float) ($value ?? 0), 0, ',', '.');
    $number = static fn ($value): string => number_format((float) ($value ?? 0), 0, ',', '.');
    $statusLabel = static fn ($status): string => match ($status) {
        'credited_to_balance' => 'Sudah cair',
        'not_reported' => 'Belum dilaporkan',
        'refunded' => 'Refund',
        default => $status ?: 'Belum ada status',
    };
@endphp

@section('title', 'Dashboard · MP-TikTok')

@section('content')
    <section id="overview" class="hero">
        <div>
            <p class="eyebrow">Dashboard operasional</p>
            <h1>Selamat datang di workspace kamu.</h1>
            <p class="hero-copy">Pantau order, pengiriman, transaksi, dan proses import dari satu halaman Laravel.</p>
        </div>
        <form class="store-picker" method="GET" action="{{ route('dashboard') }}">
            <label for="store_id">Toko aktif</label>
            <select id="store_id" name="store_id" onchange="this.form.submit()">
                @forelse ($stores as $store)
                    <option value="{{ $store->id }}" @selected($selectedStore?->id === $store->id)>{{ $store->name }}</option>
                @empty
                    <option value="">Belum ada toko</option>
                @endforelse
            </select>
        </form>
    </section>

    <section class="metric-grid" aria-label="Ringkasan utama">
        <article class="metric-card blue"><span>Total order</span><strong>{{ $number($summary['total_orders']) }}</strong><small>{{ $rupiah($summary['gross_order_amount']) }} nilai order</small></article>
        <article class="metric-card green"><span>Sudah cair</span><strong>{{ $number($summary['credited_orders']) }}</strong><small>{{ $rupiah($summary['settlement_amount']) }} settlement</small></article>
        <article class="metric-card amber"><span>Pengiriman</span><strong>{{ $number($summary['shipped_packages']) }}</strong><small>{{ $number($summary['delivered_packages']) }} paket terkirim</small></article>
        <article class="metric-card violet"><span>Transaksi</span><strong>{{ $number($summary['transaction_count']) }}</strong><small>{{ $rupiah($summary['total_revenue']) }} pendapatan</small></article>
    </section>

    <section class="section-card summary-grid">
        <div>
            <p class="eyebrow">Status workspace</p>
            <h2>{{ $selectedStore?->name ?? 'Belum ada toko' }}</h2>
            <p class="muted">Data ditarik langsung dari SQLite Laravel. Perubahan tersimpan di database setelah form diproses.</p>
        </div>
        <div class="summary-list">
            <div><span>Order menunggu laporan</span><strong>{{ $number($summary['pending_orders']) }}</strong></div>
            <div><span>Total biaya</span><strong>{{ $rupiah($summary['total_fees']) }}</strong></div>
            <div><span>Paket tercatat</span><strong>{{ $number($summary['package_count']) }}</strong></div>
        </div>
    </section>

    <section id="orders" class="section-card">
        <div class="section-heading">
            <div><p class="eyebrow">Aktivitas terbaru</p><h2>Pesanan terakhir</h2></div>
            <span class="badge">{{ $number($orders->count()) }} baris</span>
        </div>
        @if ($orders->isEmpty())
            <div class="empty">Belum ada data order. Upload file shipment dari bagian Import data.</div>
        @else
            <div class="table-wrap">
                <table>
                    <thead><tr><th>Order</th><th>Item</th><th>Status</th><th>Pengiriman</th><th class="numeric">Nilai</th></tr></thead>
                    <tbody>
                        @foreach ($orders as $order)
                            <tr>
                                <td><strong>{{ $order->external_order_id }}</strong><small>{{ $order->source_created_at ?: 'Tanpa tanggal' }}</small></td>
                                <td>{{ $order->product_name ?: 'Item belum tersedia' }}<small>{{ $order->variation ?: '' }} @if ($order->quantity) · Qty {{ $order->quantity }} @endif</small></td>
                                <td><span class="status">{{ $statusLabel($order->financial_status) }}</span><small>{{ $order->source_order_status ?: '—' }}</small></td>
                                <td>{{ $order->tracking_id ?: 'Belum ada resi' }}<small>{{ $order->delivered_at ? 'Terkirim' : 'Belum terkirim' }}</small></td>
                                <td class="numeric"><strong>{{ $rupiah($order->order_amount) }}</strong></td>
                            </tr>
                        @endforeach
                    </tbody>
                </table>
            </div>
        @endif
    </section>

    <section id="imports" class="two-column">
        <article class="section-card">
            <div class="section-heading"><div><p class="eyebrow">Data pengiriman</p><h2>Import shipment CSV</h2></div><span class="icon-box">CSV</span></div>
            <p class="muted">Masukkan file pengiriman untuk membuat order, paket, dan item di database.</p>
            <form class="stack-form" method="POST" action="{{ route('imports.shipment') }}" enctype="multipart/form-data">
                @csrf
                <input type="hidden" name="store_id" value="{{ $selectedStore?->id }}">
                <label>File CSV<input type="file" name="shipment" accept=".csv,.txt" required></label>
                <button class="button primary" type="submit" @disabled(!$selectedStore)>Import shipment</button>
            </form>
        </article>
        <article class="section-card">
            <div class="section-heading"><div><p class="eyebrow">Data keuangan</p><h2>Import income XLSX</h2></div><span class="icon-box">XLSX</span></div>
            <p class="muted">Masukkan laporan income untuk mencatat settlement, biaya, refund, dan transfer.</p>
            <form class="stack-form" method="POST" action="{{ route('imports.income') }}" enctype="multipart/form-data">
                @csrf
                <input type="hidden" name="store_id" value="{{ $selectedStore?->id }}">
                <label>File XLSX<input type="file" name="income" accept=".xlsx" required></label>
                <button class="button primary" type="submit" @disabled(!$selectedStore)>Import keuangan</button>
            </form>
        </article>
    </section>

    <section id="stores" class="two-column">
        <article class="section-card">
            <div class="section-heading"><div><p class="eyebrow">Workspace</p><h2>Tambah toko</h2></div></div>
            <form class="stack-form" method="POST" action="{{ route('stores.store') }}">
                @csrf
                <label>Nama toko<input type="text" name="name" value="{{ old('name') }}" placeholder="Contoh: Toko Utama" required></label>
                <label>Platform<select name="platform"><option value="tiktok">TikTok Shop</option><option value="lainnya">Lainnya</option></select></label>
                <button class="button primary" type="submit">Simpan toko</button>
            </form>
        </article>
        <article class="section-card">
            <div class="section-heading"><div><p class="eyebrow">Riwayat import</p><h2>Batch terakhir</h2></div></div>
            @forelse ($imports as $import)
                <div class="import-row"><div><strong>{{ strtoupper($import->kind) }}</strong><small>{{ $import->filename }}</small></div><span class="status">{{ $import->status }}</span></div>
            @empty
                <div class="empty">Belum ada batch import untuk toko ini.</div>
            @endforelse
        </article>
    </section>

    <footer class="footer">MP-TikTok · Laravel Blade · SQLite</footer>
@endsection
