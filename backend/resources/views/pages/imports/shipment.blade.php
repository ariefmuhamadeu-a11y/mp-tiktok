@extends('layouts.app')

@section('title', 'Import Pengiriman · MP-TikTok')
@section('content')
    @include('partials.page-header', ['eyebrow' => 'Data pengiriman', 'title' => 'Import Pengiriman', 'description' => 'Upload CSV pengiriman untuk membuat order, paket, dan item pada database.'])
    <div class="two-column"><section class="section-card"><div class="section-heading"><div><p class="eyebrow">Upload</p><h2>Shipment CSV</h2></div><span class="icon-box">CSV</span></div><form class="stack-form" method="POST" action="{{ route('imports.shipment') }}" enctype="multipart/form-data">@csrf<input type="hidden" name="store_id" value="{{ $selectedStore?->id }}"><label>File CSV<input type="file" name="shipment" accept=".csv,.txt" required></label><button class="button primary" type="submit" @disabled(!$selectedStore)>Import ke database</button></form></section><section class="section-card"><div class="section-heading"><div><p class="eyebrow">Audit</p><h2>Batch terakhir</h2></div></div>@forelse ($imports->where('kind', 'shipment') as $import)<div class="import-row"><div><strong>{{ $import->filename }}</strong><small>{{ $import->imported_at ?: 'Sedang diproses' }}</small></div><span class="status">{{ $import->status }}</span></div>@empty<div class="empty">Belum ada import pengiriman.</div>@endforelse</section></div>
@endsection
