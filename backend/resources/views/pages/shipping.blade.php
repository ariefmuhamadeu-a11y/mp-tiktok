@extends('layouts.app')

@section('title', 'Pengiriman · MP-TikTok')
@section('content')
    @include('partials.page-header', ['eyebrow' => 'Operasional', 'title' => 'Pengiriman', 'description' => 'Pantau paket, resi, kurir, dan status pengiriman.'])
    <section class="section-card">
        <div class="section-heading"><div><p class="eyebrow">Daftar paket</p><h2>{{ $selectedStore?->name ?? 'Belum ada toko' }}</h2></div><a class="button primary" href="{{ route('imports.shipment.index', ['store_id' => $selectedStore?->id]) }}">Import shipment</a></div>
        @if ($packages->isEmpty())
            <div class="empty">Belum ada paket untuk toko ini.</div>
        @else
            <div class="table-wrap"><table><thead><tr><th>Order</th><th>Resi</th><th>Kurir</th><th>Tujuan</th><th>Status</th></tr></thead><tbody>
                @foreach ($packages as $package)
                    @php $status = $package->delivered_at ? 'Terkirim' : ($package->shipped_at ? 'Dalam pengiriman' : 'Belum dikirim'); @endphp
                    <tr><td><strong>{{ $package->external_order_id }}</strong><small>{{ $package->source_order_status ?: '—' }}</small></td><td>{{ $package->tracking_id ?: 'Belum tersedia' }}</td><td>{{ $package->shipping_provider_name ?: '—' }}</td><td>{{ $package->recipient ?: '—' }}<small>{{ $package->regency_city ?: '' }}</small></td><td><span class="status">{{ $status }}</span><small>{{ $package->delivered_at ?: $package->shipped_at ?: 'Belum ada tanggal' }}</small></td></tr>
                @endforeach
            </tbody></table></div>
        @endif
    </section>
@endsection
