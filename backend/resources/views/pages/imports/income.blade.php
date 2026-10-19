@extends('layouts.app')

@section('title', 'Import Keuangan · MP-TikTok')
@section('content')
    @include('partials.page-header', ['eyebrow' => 'Data keuangan', 'title' => 'Import Keuangan', 'description' => 'Upload laporan income XLSX untuk menyimpan settlement, biaya, refund, dan transfer.'])
    <div class="two-column"><section class="section-card"><div class="section-heading"><div><p class="eyebrow">Upload</p><h2>Laporan income</h2></div><span class="icon-box">XLSX</span></div><form class="stack-form" method="POST" action="{{ route('imports.income') }}" enctype="multipart/form-data">@csrf<input type="hidden" name="store_id" value="{{ $selectedStore?->id }}"><label>File XLSX<input type="file" name="income" accept=".xlsx" required></label><button class="button primary" type="submit" @disabled(!$selectedStore)>Import ke database</button></form></section><section class="section-card"><div class="section-heading"><div><p class="eyebrow">Audit</p><h2>Batch terakhir</h2></div></div>@forelse ($imports->where('kind', 'income') as $import)<div class="import-row"><div><strong>{{ $import->filename }}</strong><small>{{ $import->imported_at ?: 'Sedang diproses' }}</small></div><span class="status">{{ $import->status }}</span></div>@empty<div class="empty">Belum ada import keuangan.</div>@endforelse</section></div>
@endsection
