import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class EngineInitService {
  private _engineRef = signal<any>(null);

  engineRef = this._engineRef.asReadonly();

  setEngine(engine: any): void {
    this._engineRef.set(engine);
  }

  cleanup(): void {
    const eng = this._engineRef();
    if (eng?.stop) eng.stop();
    this._engineRef.set(null);
  }
}
