@extends('layouts.app')

@php $rupiah = static fn ($value): string => 'Rp'.number_format((float) ($value ?? 0), 0, ',', '.'); @endphp

@section('title', 'Pesanan · MP-TikTok')
@section('content')
    @include('partials.page-header', ['eyebrow' => 'Operasional', 'title' => 'Pesanan', 'description' => 'Tinjau order dan item terbaru dari toko yang dipilih.'])
    <section class="section-card">
        <div class="section-heading"><div><p class="eyebrow">Data order</p><h2>{{ $selectedStore?->name ?? 'Belum ada toko' }}</h2></div><span class="badge">{{ $orders->count() }} baris</span></div>
        @if ($orders->isEmpty())
            <div class="empty">Belum ada order. Import shipment dari halaman Import Pengiriman.</div>
        @else
            <div class="table-wrap"><table><thead><tr><th>Order</th><th>Item</th><th>Status</th><th>Resi</th><th class="numeric">Nilai</th></tr></thead><tbody>
                @foreach ($orders as $order)
                    <tr><td><strong>{{ $order->external_order_id }}</strong><small>{{ $order->source_created_at ?: 'Tanpa tanggal' }}</small></td><td>{{ $order->product_name ?: 'Item belum tersedia' }}<small>{{ $order->variation ?: '' }} @if ($order->quantity) · Qty {{ $order->quantity }} @endif</small></td><td><span class="status">{{ $order->financial_status ?: 'Belum dilaporkan' }}</span><small>{{ $order->source_order_status ?: '—' }}</small></td><td>{{ $order->tracking_id ?: 'Belum ada resi' }}<small>{{ $order->delivered_at ? 'Terkirim' : 'Belum terkirim' }}</small></td><td class="numeric"><strong>{{ $rupiah($order->order_amount) }}</strong></td></tr>
                @endforeach
            </tbody></table></div>
        @endif
    </section>
@endsection
