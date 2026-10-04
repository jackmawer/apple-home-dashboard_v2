import { CustomizationManager } from './CustomizationManager';
import { DashboardConfig, DeviceGroup } from '../config/DashboardConfig';
import { AppleChips } from '../sections/AppleChips';
import { localize } from './LocalizationService';
import { RTLHelper } from './RTLHelper';
import { injectLiquidGlassStyles, LiquidGlassClasses } from './LiquidGlassStyles';

interface ChipItem {
  group: DeviceGroup;
  name: string;
  visible: boolean;
}

/**
 * Modal that lets the user hide/show individual chips. Lived during edit
 * mode, so saves go through the CustomizationManager already held deferred by
 * the view - they persist together with the rest of the edit session.
 */
export class ChipsEditManager {
  private modal?: HTMLElement;
  private customizationManager: CustomizationManager;
  private onVisibilityChange?: (hidden: string[]) => void;

  constructor(customizationManager: CustomizationManager) {
    this.customizationManager = customizationManager;
  }

  onChipVisibilityChange(cb: (hidden: string[]) => void): void {
    this.onVisibilityChange = cb;
  }

  public async showChipsEditModal(hass: any): Promise<void> {
    const configs = AppleChips.getDefaultConfig();
    const hidden = new Set(this.customizationManager.getHiddenChips());
    const chips: ChipItem[] = Object.entries(configs).map(([key, cfg]) => ({
      group: cfg!.group as DeviceGroup,
      name: DashboardConfig.getGroupStyle(cfg!.group as DeviceGroup).name instanceof Function
        ? (DashboardConfig.getGroupStyle(cfg!.group as DeviceGroup).name as () => string)()
        : localize(`groups.${key}`),
      visible: !hidden.has(cfg!.group)
    }));
    if (chips.length === 0) return;

    this.modal = document.createElement('div');
    this.modal.className = `apple-chips-edit-modal ${RTLHelper.isRTL() ? 'rtl' : 'ltr'}`;
    this.modal.innerHTML = `
      <div class="modal-backdrop"></div>
      <div class="modal-content">
        <div class="modal-header">
          <button class="modal-cancel ${LiquidGlassClasses.modalCancel}">
            <ha-icon icon="mdi:close"></ha-icon>
          </button>
          <h2>${localize('chips_edit.title')}</h2>
          <button class="modal-done ${LiquidGlassClasses.modalDone}">
            <ha-icon icon="mdi:check"></ha-icon>
          </button>
        </div>
        <div class="modal-body">
          <div class="chips-list">
            ${chips.map((c, i) => `
              <div class="chip-item ${c.visible ? 'visible' : 'hidden'}" data-chip-id="${c.group}" data-index="${i}">
                <button class="chip-visibility-toggle ${c.visible ? 'visible' : 'hidden'}" data-chip-id="${c.group}">
                  <ha-icon icon="${c.visible ? 'mdi:eye' : 'mdi:eye-off'}"></ha-icon>
                </button>
                <div class="chip-info">
                  <span class="chip-name">${c.name}</span>
                </div>
              </div>
            `).join('')}
          </div>
          <p class="chips-edit-hint">${localize('chips_edit.hint')}</p>
        </div>
      </div>
    `;

    this.addModalStyles();
    document.body.appendChild(this.modal);
    this.setupEventListeners();
    // Reuse the SectionReorder/Settings modal entrance animation pattern
    requestAnimationFrame(() => this.modal!.classList.add('show'));
  }

  private setupEventListeners(): void {
    if (!this.modal) return;

    this.modal.querySelector('.modal-cancel')?.addEventListener('click', () => this.closeModal());
    this.modal.querySelector('.modal-done')?.addEventListener('click', () => this.closeModal());
    this.modal.querySelector('.modal-backdrop')?.addEventListener('click', () => this.closeModal());
    document.addEventListener('keydown', this.handleEscapeKey);

    const list = this.modal.querySelector('.chips-list');
    // Toggle visibility - click and touchstart like SectionReorderManager
    ['click', 'touchstart'].forEach(evt => {
      list?.addEventListener(evt, (e) => {
        const target = e.target as HTMLElement;
        const btn = target.closest('.chip-visibility-toggle') as HTMLElement | null;
        if (!btn) return;
        e.preventDefault();
        e.stopPropagation();
        const group = btn.dataset.chipId;
        if (!group) return;
        const item = btn.closest('.chip-item') as HTMLElement;
        const nowVisible = item.classList.toggle('visible');
        item.classList.toggle('hidden', !nowVisible);
        btn.classList.toggle('visible', nowVisible);
        btn.classList.toggle('hidden', !nowVisible);
        btn.querySelector('ha-icon')?.setAttribute('icon', nowVisible ? 'mdi:eye' : 'mdi:eye-off');
        this.persistHiddenChips();
      }, { capture: true });
    });
  }

  private persistHiddenChips(): void {
    const hidden = Array.from(this.modal?.querySelectorAll('.chip-item.hidden') as NodeListOf<HTMLElement>)
      .map(el => el.dataset.chipId) as string[];
    void this.customizationManager.saveHiddenChips(hidden);
    this.onVisibilityChange?.(hidden);
  }

  private handleEscapeKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') this.closeModal();
  };

  private closeModal(): void {
    if (!this.modal) return;
    document.removeEventListener('keydown', this.handleEscapeKey);
    this.modal.classList.remove('show');
    setTimeout(() => this.modal?.remove(), 300);
    this.modal = undefined;
  }

  private addModalStyles(): void {
    injectLiquidGlassStyles();
    if (document.querySelector('#apple-chips-edit-styles')) return;
    const style = document.createElement('style');
    style.id = 'apple-chips-edit-styles';
    style.textContent = `
      .apple-chips-edit-modal {
        position: fixed;
        inset: 0;
        z-index: 10000;
        font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', Roboto, sans-serif;
        display: flex;
        align-items: center;
        justify-content: center;
        opacity: 0;
        transition: opacity 0.3s ease;
      }
      .apple-chips-edit-modal.show { opacity: 1; }
      .apple-chips-edit-modal .modal-backdrop {
        position: absolute; inset: 0;
        background: rgba(0, 0, 0, 0.4);
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
      }
      .apple-chips-edit-modal .modal-content {
        position: relative;
        width: 600px;
        max-width: 90vw;
        max-height: 80vh;
        background: rgba(28, 28, 30, 1);
        border-radius: var(--apple-modal-radius, 20px);
        overflow-y: auto;
        box-shadow: 0 20px 40px rgba(0, 0, 0, 0.5);
        transform: scale(0.9);
        opacity: 0;
        transition: all 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94);
      }
      .apple-chips-edit-modal.show .modal-content { transform: scale(1); opacity: 1; }
      .apple-chips-edit-modal .modal-header {
        display: flex; align-items: center; justify-content: space-between;
        padding: 12px 16px; position: sticky; top: 0; z-index: 10;
      }
      .apple-chips-edit-modal .modal-header h2 {
        margin: 0; font-size: 17px; font-weight: 600; color: white; text-align: center; flex: 1;
      }
      .apple-chips-edit-modal .modal-body { padding-bottom: 20px; }
      .apple-chips-edit-modal .chips-list {
        margin: 0 20px; background: rgba(44, 44, 46, 0.6);
        border-radius: var(--apple-input-radius, 10px); overflow: hidden;
      }
      .apple-chips-edit-modal .chip-item {
        display: flex; align-items: center; gap: 8px;
        padding: 14px 16px; border-bottom: 1px solid rgba(255, 255, 255, 0.08);
      }
      .apple-chips-edit-modal .chip-item:last-child { border-bottom: none; }
      .apple-chips-edit-modal .chip-item.hidden { opacity: 0.6; }
      .apple-chips-edit-modal .chip-visibility-toggle {
        background: none; border: none; color: #ffffff; cursor: pointer;
        border-radius: 16px; transition: all 0.2s ease; padding: 4px;
        display: flex; align-items: center; justify-content: center;
        -webkit-tap-highlight-color: transparent; touch-action: manipulation;
      }
      .apple-chips-edit-modal .chip-visibility-toggle.hidden { color: #ffffff80; }
      .apple-chips-edit-modal .chip-name { color: white; font-size: 15px; font-weight: 500; }
      .apple-chips-edit-modal .chip-info { flex: 1; min-width: 0; }
      .apple-chips-edit-modal .chips-edit-hint {
        margin: 10px 20px 0; font-size: 13px; color: rgba(255, 255, 255, 0.6); line-height: 1.4;
      }
      .apple-chips-edit-modal.rtl .chip-visibility-toggle { margin-right: 0; margin-left: 8px; }
      @media (prefers-reduced-motion: reduce) {
        .apple-chips-edit-modal,
        .apple-chips-edit-modal .modal-content,
        .apple-chips-edit-modal .chip-visibility-toggle { transition: none !important; }
      }
    `;
    document.head.appendChild(style);
  }
}
