@extends('layouts.app')

@section('title', $module['title'].' · MP-TikTok')
@section('content')
    <section class="hero"><div><p class="eyebrow">Modul workspace</p><h1>{{ $module['title'] }}</h1><p class="hero-copy">{{ $module['description'] }}</p></div></section>
    <section class="section-card module-placeholder"><div class="placeholder-icon">●</div><h2>Route Blade sudah tersedia</h2><p>Struktur halaman ini sudah dipisahkan dari dashboard. CRUD dan migration Laravel untuk modul ini menjadi tahap berikutnya; implementasi lama masih tersedia di folder backup Vite/Node.</p><a class="button primary" href="{{ route('dashboard') }}">Kembali ke dashboard</a></section>
@endsection
