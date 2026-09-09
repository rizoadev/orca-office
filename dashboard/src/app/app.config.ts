import { ApplicationConfig, provideZoneChangeDetection } from '@angular/core';
import { provideHttpClient, withFetch } from '@angular/common/http';

import { provideZard } from '@/shared/core/provider/providezard';

/**
 * Tidak ada provideRouter di sini dengan sengaja: aplikasi ini satu layar tanpa
 * navigasi (persis seperti versi aslinya) dan AppComponent di-bootstrap langsung
 * dari main.ts. Router scaffold hanya akan menambah bundle + `<router-outlet>`
 * kosong yang tidak pernah ada di template.
 */
export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideHttpClient(withFetch()),
    provideZard(),
  ],
};
