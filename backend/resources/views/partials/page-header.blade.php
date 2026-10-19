<section class="page-heading">
    <div>
        <p class="eyebrow">{{ $eyebrow }}</p>
        <h1>{{ $title }}</h1>
        <p class="hero-copy">{{ $description }}</p>
    </div>
    @if (isset($stores))
        <form class="store-picker" method="GET" action="{{ url()->current() }}">
            <label for="store_id">Toko aktif</label>
            <select id="store_id" name="store_id" onchange="this.form.submit()">
                @forelse ($stores as $store)
                    <option value="{{ $store->id }}" @selected($selectedStore?->id === $store->id)>{{ $store->name }}</option>
                @empty
                    <option value="">Belum ada toko</option>
                @endforelse
            </select>
        </form>
    @endif
</section>
