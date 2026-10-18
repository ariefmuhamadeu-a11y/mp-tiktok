<?php

namespace Database\Seeders;

use App\Models\Store;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

class DemoCommerceStoreSeeder extends Seeder
{
    /**
     * Run the database seeds.
     */
    public function run(): void
    {
        $user = User::firstOrCreate(
            ['email' => 'import-demo@example.test'],
            ['name' => 'Import Demo', 'password' => Hash::make(Str::random(64))],
        );

        Store::firstOrCreate(
            ['user_id' => $user->id, 'slug' => 'toko-contoh-import'],
            ['name' => 'Toko Contoh Import', 'platform' => 'tiktok', 'is_active' => true],
        );
    }
}
