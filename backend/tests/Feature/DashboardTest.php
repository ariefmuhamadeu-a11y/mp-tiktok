<?php

namespace Tests\Feature;

use App\Models\Store;
use App\Models\User;
use Illuminate\Foundation\Testing\LazilyRefreshDatabase;
use Illuminate\Http\UploadedFile;
use Tests\TestCase;

class DashboardTest extends TestCase
{
    use LazilyRefreshDatabase;

    public function test_dashboard_is_rendered_by_blade_without_a_frontend_build(): void
    {
        $user = User::factory()->create();
        Store::create([
            'user_id' => $user->id,
            'name' => 'Toko Blade',
            'slug' => 'toko-blade',
            'platform' => 'tiktok',
            'is_active' => true,
        ]);

        $response = $this->get('/');

        $response->assertOk();
        $response->assertSee('Selamat datang di workspace kamu.');
        $response->assertSee('Toko Blade');
        $response->assertSee('Laravel Blade aktif');
    }

    public function test_user_can_create_a_store_from_the_blade_dashboard(): void
    {
        User::factory()->create([
            'name' => 'Workspace Owner',
            'email' => 'owner@mp-tiktok.test',
        ]);

        $response = $this->post('/stores', [
            'name' => 'Toko Baru',
            'platform' => 'tiktok',
        ]);

        $response->assertRedirect();
        $this->assertDatabaseHas('stores', [
            'name' => 'Toko Baru',
            'slug' => 'toko-baru',
            'platform' => 'tiktok',
        ]);
    }

    public function test_user_can_import_a_shipment_csv_from_the_blade_dashboard(): void
    {
        $user = User::factory()->create();
        $store = Store::create([
            'user_id' => $user->id,
            'name' => 'Toko Import',
            'slug' => 'toko-import',
            'platform' => 'tiktok',
            'is_active' => true,
        ]);
        $csv = implode("\n", [
            'Order ID,SKU ID,Package ID,Seller SKU,Product Name,Variation,Order Status,Quantity',
            'ORDER-1,SKU-1,PACKAGE-1,SELLER-1,Produk Demo,Merah,Dikirim,1',
        ]);

        $response = $this->post('/imports/shipment', [
            'store_id' => $store->id,
            'shipment' => UploadedFile::fake()->createWithContent('shipment.csv', $csv),
        ]);

        $response->assertRedirect();
        $this->assertDatabaseHas('orders', [
            'store_id' => $store->id,
            'external_order_id' => 'ORDER-1',
        ]);
    }
}
