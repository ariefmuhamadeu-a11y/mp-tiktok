@extends('layouts.app')

@php $rupiah = static fn ($value): string => 'Rp'.number_format((float) ($value ?? 0), 0, ',', '.'); @endphp

@section('title', 'Transaksi · MP-TikTok')
@section('content')
    @include('partials.page-header', ['eyebrow' => 'Keuangan', 'title' => 'Transaksi', 'description' => 'Lihat settlement, pendapatan, dan biaya dari laporan income.'])
    <section class="metric-grid"><article class="metric-card green"><span>Settlement</span><strong>{{ $rupiah($summary['settlement_amount']) }}</strong><small>{{ $summary['transaction_count'] }} transaksi</small></article><article class="metric-card blue"><span>Pendapatan</span><strong>{{ $rupiah($summary['total_revenue']) }}</strong><small>Total revenue</small></article><article class="metric-card amber"><span>Biaya</span><strong>{{ $rupiah($summary['total_fees']) }}</strong><small>Total fees</small></article><article class="metric-card violet"><span>Order</span><strong>{{ $summary['credited_orders'] }}</strong><small>Sudah cair</small></article></section>
    <section class="section-card"><div class="section-heading"><div><p class="eyebrow">Ledger</p><h2>Transaksi terakhir</h2></div><a class="button primary" href="{{ route('imports.income.index', ['store_id' => $selectedStore?->id]) }}">Import income</a></div>
        @if ($transactions->isEmpty()) <div class="empty">Belum ada transaksi untuk toko ini.</div>
        @else <div class="table-wrap"><table><thead><tr><th>Referensi</th><th>Jenis</th><th>Tanggal</th><th>Order</th><th class="numeric">Settlement</th><th class="numeric">Pendapatan</th></tr></thead><tbody>
            @foreach ($transactions as $transaction)
                <tr><td><strong>{{ $transaction->external_reference_id }}</strong><small>{{ $transaction->credited_on ?: $transaction->ordered_on ?: 'Tanpa tanggal' }}</small></td><td>{{ $transaction->transaction_type ?: 'Lainnya' }}</td><td>{{ $transaction->ordered_on ?: '—' }}</td><td>{{ $transaction->external_order_id ?: 'Tidak terkait order' }}</td><td class="numeric"><strong>{{ $rupiah($transaction->settlement_amount) }}</strong></td><td class="numeric">{{ $rupiah($transaction->total_revenue) }}</td></tr>
            @endforeach
        </tbody></table></div> @endif
    </section>
@endsection
