// ============================================================
// AppComponent — port 1:1 App.tsx (struktur render + bootstrap)
// ============================================================

import { Component, inject, computed, OnInit, OnDestroy } from '@angular/core';
import { AuthService } from './core/services/auth.service';
import { WebsocketService } from './core/services/websocket.service';
import { AccessGateComponent } from './shared/auth/access-gate.component';
import { MainLayoutComponent } from './shared/layout/main-layout.component';
import { TopbarComponent } from './shared/topbar/topbar.component';
import { CanvasStageComponent } from './stage/canvas-stage.component';
import { SidebarComponent } from './shared/sidebar/sidebar.component';
import { ToastContainerComponent } from './shared/toast/toast-container.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    AccessGateComponent,
    MainLayoutComponent,
    TopbarComponent,
    CanvasStageComponent,
    SidebarComponent,
    ToastContainerComponent,
  ],
  template: `
    @if (unauthorized()) {
      <app-access-gate />
      <app-toast-container />
    } @else {
      <app-topbar />
      <app-main-layout>
        <canvas-stage stage />
        <app-sidebar sidebar />
      </app-main-layout>
      <app-toast-container />
    }
  `,
})
export class AppComponent implements OnInit, OnDestroy {
  private auth = inject(AuthService);
  private ws = inject(WebsocketService);

  unauthorized = computed(() => this.auth.unauthorized());

  ngOnInit(): void {
    // Akses cepat: ?auth= / ?token= di URL langsung dipakai untuk login otomatis
    // saat dashboard ke-load, lalu dihapus dari address bar.
    this.auth.handleQuickLoginQuery();

    // Probe /api/state → kalau terbuka, naikkan WS.
    void this.auth.authorizeViaProbe().then((ok) => {
      if (ok) this.ws.connect();
    });
  }

  ngOnDestroy(): void {
    this.ws.dispose();
  }
}
