@extends('layouts.app')

@section('title', 'Toko · MP-TikTok')
@section('content')
    @include('partials.page-header', ['eyebrow' => 'Workspace', 'title' => 'Toko', 'description' => 'Kelola toko aktif yang menjadi scope data import dan laporan.'])
    <div class="two-column"><section class="section-card"><div class="section-heading"><div><p class="eyebrow">Toko baru</p><h2>Tambah toko</h2></div></div><form class="stack-form" method="POST" action="{{ route('stores.store') }}">@csrf<label>Nama toko<input type="text" name="name" placeholder="Contoh: Toko Utama" required></label><label>Platform<select name="platform"><option value="tiktok">TikTok Shop</option><option value="lainnya">Lainnya</option></select></label><button class="button primary" type="submit">Simpan toko</button></form></section><section class="section-card"><div class="section-heading"><div><p class="eyebrow">Workspace</p><h2>Daftar toko</h2></div><span class="badge">{{ $stores->count() }} aktif</span></div>@forelse ($stores as $store)<div class="import-row"><div><strong>{{ $store->name }}</strong><small>{{ $store->platform }} · {{ $store->slug }}</small></div><a class="button" href="{{ route('dashboard', ['store_id' => $store->id]) }}">Buka dashboard</a></div>@empty<div class="empty">Belum ada toko.</div>@endforelse</section></div>
@endsection
