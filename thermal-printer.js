/**
 * thermal-printer.js
 * Generic ESC/POS Thermal Printer for School PWA
 * Supports: Web Bluetooth + WebUSB (USB port)
 * Works with most HiLabel, SpeedX, Xprinter, Rongta, Epson TM, etc.
 * The Smart Modern Public School Qamber
 */

export class ThermalPrinter {
  constructor(options = {}) {
    this.device = null;          // Bluetooth device or USB device
    this.server = null;          // GATT server (Bluetooth)
    this.characteristic = null; // Bluetooth write characteristic
    this.usbDevice = null;       // WebUSB device
    this.usbInterface = null;
    this.usbEndpoint = null;
    this.connectionType = null;  // 'bluetooth' | 'usb'
    this.isConnected = false;

    // ========== ADJUSTABLE SETTINGS ==========
    // Paper: 58mm = 32 chars, 80mm = 48 chars
    this.paperWidth = options.paperWidth || 58;       // 58 or 80
    this.charsPerLine = this.paperWidth <= 58 ? 32 : 48;
    this.chunkSize = options.chunkSize || 48;         // smaller = more reliable on BT
    this.chunkDelay = options.chunkDelay || 40;       // ms between chunks (40-60 safe)
    this.feedBeforeCut = options.feedBeforeCut != null ? options.feedBeforeCut : 0; // 0 = no blank paper
    this.usePartialCut = options.usePartialCut !== false; // true = kam paper advance
    this.debug = options.debug || false;
    // ========================================

    // Common Bluetooth Service UUIDs used by many Chinese thermal printers
    this.SERVICE_UUIDS = [
      '000018f0-0000-1000-8000-00805f9b34fb',
      'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
      '49535343-fe7d-4ae5-8fa9-9fafd205e455',
      '0000ff00-0000-1000-8000-00805f9b34fb',
      '0000ae30-0000-1000-8000-00805f9b34fb',
      '0000fff0-0000-1000-8000-00805f9b34fb',
      '0000ffe0-0000-1000-8000-00805f9b34fb',
      '0000ff10-0000-1000-8000-00805f9b34fb',
      '49535343-fe7d-4ae5-8fa9-9fafd205e455'
    ];

    this.WRITE_CHAR_UUIDS = [
      '00002af1-0000-1000-8000-00805f9b34fb',
      'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
      '49535343-8841-43f4-a8d4-ecbe34729bb3',
      '0000ff02-0000-1000-8000-00805f9b34fb',
      '0000ae01-0000-1000-8000-00805f9b34fb',
      '0000fff1-0000-1000-8000-00805f9b34fb',
      '0000fff2-0000-1000-8000-00805f9b34fb',
      '0000ffe1-0000-1000-8000-00805f9b34fb',
      '0000ff11-0000-1000-8000-00805f9b34fb'
    ];
  }

  log(...args) {
    if (this.debug) console.log('[Printer]', ...args);
  }

  /* ===================== CONNECT ===================== */

  /**
   * Smart connect — pehle user se poochta hai Bluetooth ya USB
   */
  async connect() {
    // Prefer Bluetooth on mobile, USB on desktop — but always ask via prompt for clarity
    const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    let choice = 'bluetooth';

    if (navigator.usb && !isMobile) {
      // Desktop: offer choice
      const useUsb = confirm(
        'Printer kaise connect karna hai?\n\n' +
        'OK  = USB (computer ke USB port se)\n' +
        'Cancel = Bluetooth'
      );
      choice = useUsb ? 'usb' : 'bluetooth';
    } else if (!navigator.bluetooth && navigator.usb) {
      choice = 'usb';
    }

    if (choice === 'usb') {
      return await this.connectUSB();
    }
    return await this.connectBluetooth();
  }

  async connectBluetooth() {
    if (!navigator.bluetooth) {
      throw new Error('Web Bluetooth support nahi hai.\nChrome/Edge (Android) use karo ya USB try karo.');
    }

    this.log('Requesting Bluetooth device...');
    this.device = await navigator.bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices: this.SERVICE_UUIDS
    });

    this.server = await this.device.gatt.connect();
    this.log('GATT connected, searching characteristics...');

    let found = false;

    // First try known UUIDs
    for (const su of this.SERVICE_UUIDS) {
      try {
        const service = await this.server.getPrimaryService(su);
        for (const cu of this.WRITE_CHAR_UUIDS) {
          try {
            const char = await service.getCharacteristic(cu);
            if (char.properties.write || char.properties.writeWithoutResponse) {
              this.characteristic = char;
              found = true;
              this.log('Found known characteristic', cu);
              break;
            }
          } catch (e) {}
        }
        if (found) break;
      } catch (e) {}
    }

    // Fallback: scan all services/characteristics
    if (!found) {
      this.log('Scanning all services...');
      const services = await this.server.getPrimaryServices();
      for (const service of services) {
        try {
          const chars = await service.getCharacteristics();
          for (const char of chars) {
            if (char.properties.write || char.properties.writeWithoutResponse) {
              this.characteristic = char;
              found = true;
              this.log('Found fallback characteristic', char.uuid);
              break;
            }
          }
        } catch (e) {}
        if (found) break;
      }
    }

    if (!found) throw new Error('Printer write characteristic nahi mili.\nPrinter ON hai aur pair-able mode mein hai?');

    this.connectionType = 'bluetooth';
    this.isConnected = true;
    this.device.addEventListener('gattserverdisconnected', () => {
      this.isConnected = false;
      this.log('Bluetooth disconnected');
    });

    return this.device.name || 'Bluetooth Printer';
  }

  async connectUSB() {
    if (!navigator.usb) {
      throw new Error('WebUSB support nahi hai.\nChrome/Edge latest version use karo (desktop).');
    }

    this.log('Requesting USB device...');
    // filters empty = show all USB devices (user selects the printer)
    this.usbDevice = await navigator.usb.requestDevice({
      filters: [
        // Common printer class
        { classCode: 7 },
        // Many Chinese thermal printers use vendor-specific
        // We also allow any device so user can pick manually
      ]
    }).catch(async () => {
      // If class filter fails or user cancels, try without filter
      return await navigator.usb.requestDevice({ filters: [] });
    });

    await this.usbDevice.open();
    if (this.usbDevice.configuration === null) {
      await this.usbDevice.selectConfiguration(1);
    }

    // Find a suitable interface + bulk OUT endpoint
    let iface = null;
    let endpoint = null;

    for (const config of this.usbDevice.configurations) {
      for (const inter of config.interfaces) {
        for (const alt of inter.alternates) {
          // Prefer printer class (7) or vendor specific (255)
          if (alt.interfaceClass === 7 || alt.interfaceClass === 255 || alt.interfaceClass === 0) {
            for (const ep of alt.endpoints) {
              if (ep.direction === 'out' && (ep.type === 'bulk' || ep.type === 'interrupt')) {
                iface = inter;
                endpoint = ep;
                break;
              }
            }
          }
          if (endpoint) break;
        }
        if (endpoint) break;
      }
      if (endpoint) break;
    }

    // Last resort: any OUT bulk endpoint
    if (!endpoint) {
      for (const config of this.usbDevice.configurations) {
        for (const inter of config.interfaces) {
          for (const alt of inter.alternates) {
            for (const ep of alt.endpoints) {
              if (ep.direction === 'out') {
                iface = inter;
                endpoint = ep;
                break;
              }
            }
            if (endpoint) break;
          }
          if (endpoint) break;
        }
        if (endpoint) break;
      }
    }

    if (!iface || !endpoint) {
      await this.usbDevice.close().catch(() => {});
      throw new Error('USB printer endpoint nahi mila.\nPrinter USB se connected hai aur drivers installed hain?');
    }

    await this.usbDevice.claimInterface(iface.interfaceNumber);
    this.usbInterface = iface;
    this.usbEndpoint = endpoint;
    this.connectionType = 'usb';
    this.isConnected = true;
    this.device = this.usbDevice; // for name display

    this.log('USB connected', this.usbDevice.productName, 'endpoint', endpoint.endpointNumber);

    return this.usbDevice.productName || this.usbDevice.manufacturerName || 'USB Printer';
  }

  async disconnect() {
    try {
      if (this.connectionType === 'bluetooth' && this.device?.gatt?.connected) {
        await this.device.gatt.disconnect();
      }
      if (this.connectionType === 'usb' && this.usbDevice) {
        if (this.usbInterface != null) {
          await this.usbDevice.releaseInterface(this.usbInterface.interfaceNumber).catch(() => {});
        }
        await this.usbDevice.close().catch(() => {});
      }
    } catch (e) {
      this.log('Disconnect error', e);
    }
    this.isConnected = false;
    this.connectionType = null;
    this.device = null;
    this.server = null;
    this.characteristic = null;
    this.usbDevice = null;
    this.usbInterface = null;
    this.usbEndpoint = null;
  }

  /* ===================== LOW-LEVEL WRITE ===================== */

  async write(data) {
    if (!this.isConnected) throw new Error('Printer connected nahi hai');

    const buffer = data instanceof Uint8Array ? data : new Uint8Array(data);

    if (this.connectionType === 'bluetooth') {
      await this._writeBluetooth(buffer);
    } else if (this.connectionType === 'usb') {
      await this._writeUSB(buffer);
    } else {
      throw new Error('Unknown connection type');
    }
  }

  async _writeBluetooth(buffer) {
    for (let i = 0; i < buffer.length; i += this.chunkSize) {
      const chunk = buffer.slice(i, i + this.chunkSize);
      try {
        if (this.characteristic.properties.writeWithoutResponse) {
          await this.characteristic.writeValueWithoutResponse(chunk);
        } else {
          await this.characteristic.writeValue(chunk);
        }
      } catch (e) {
        // retry with writeValue
        await this.characteristic.writeValue(chunk);
      }
      if (i + this.chunkSize < buffer.length) {
        await new Promise(r => setTimeout(r, this.chunkDelay));
      }
    }
  }

  async _writeUSB(buffer) {
    for (let i = 0; i < buffer.length; i += this.chunkSize) {
      const chunk = buffer.slice(i, i + this.chunkSize);
      await this.usbDevice.transferOut(this.usbEndpoint.endpointNumber, chunk);
      if (i + this.chunkSize < buffer.length) {
        await new Promise(r => setTimeout(r, this.chunkDelay));
      }
    }
  }

  /* ===================== SETTINGS ===================== */

  /** Runtime pe settings change karne ke liye */
  setSettings(opts = {}) {
    if (opts.paperWidth != null) {
      this.paperWidth = opts.paperWidth;
      this.charsPerLine = this.paperWidth <= 58 ? 32 : 48;
    }
    if (opts.chunkSize != null) this.chunkSize = opts.chunkSize;
    if (opts.chunkDelay != null) this.chunkDelay = opts.chunkDelay;
    if (opts.feedBeforeCut != null) this.feedBeforeCut = opts.feedBeforeCut;
    if (opts.usePartialCut != null) this.usePartialCut = opts.usePartialCut;
    if (opts.debug != null) this.debug = opts.debug;
    this.log('Settings updated', {
      paperWidth: this.paperWidth,
      charsPerLine: this.charsPerLine,
      chunkSize: this.chunkSize,
      chunkDelay: this.chunkDelay,
      feedBeforeCut: this.feedBeforeCut,
      usePartialCut: this.usePartialCut
    });
  }

  _line() {
    return '-'.repeat(Math.min(this.charsPerLine, 32));
  }

  /* ===================== ESC/POS COMMANDS ===================== */

  async init() {
    await this.write(new Uint8Array([0x1b, 0x40])); // ESC @  reset
  }

  async printText(text, opts = {}) {
    const { align = 'left', bold = false, double = false } = opts;

    if (align === 'center') await this.write(new Uint8Array([0x1b, 0x61, 0x01]));
    else if (align === 'right') await this.write(new Uint8Array([0x1b, 0x61, 0x02]));
    else await this.write(new Uint8Array([0x1b, 0x61, 0x00]));

    if (bold) await this.write(new Uint8Array([0x1b, 0x45, 0x01]));
    if (double) await this.write(new Uint8Array([0x1d, 0x21, 0x11])); // double H+W

    await this.write(new TextEncoder().encode(String(text) + '\n'));

    // Always reset size + bold after each line
    await this.write(new Uint8Array([0x1d, 0x21, 0x00]));
    await this.write(new Uint8Array([0x1b, 0x45, 0x00]));
  }

  async feed(n = 1) {
    if (!n || n < 1) return; // 0 = no feed, extra paper nahi
    await this.write(new Uint8Array([0x1b, 0x64, Math.min(n, 255)]));
  }

  async cut() {
    // Full cut with 0 extra feed (GS V 65 0)
    await this.write(new Uint8Array([0x1d, 0x56, 0x41, 0x00]));
  }

  async partialCut() {
    // Partial cut with 0 extra feed (GS V 66 0) — minimum paper
    await this.write(new Uint8Array([0x1d, 0x56, 0x42, 0x00]));
  }

  async doCut() {
    if (this.usePartialCut) await this.partialCut();
    else await this.cut();
  }

  /** Small font (Font B) for credit line */
  async printSmall(text, opts = {}) {
    const { align = 'center' } = opts;
    if (align === 'center') await this.write(new Uint8Array([0x1b, 0x61, 0x01]));
    else await this.write(new Uint8Array([0x1b, 0x61, 0x00]));
    await this.write(new Uint8Array([0x1b, 0x4d, 0x01])); // ESC M 1 = Font B (smaller)
    await this.write(new TextEncoder().encode(String(text) + '\n'));
    await this.write(new Uint8Array([0x1b, 0x4d, 0x00])); // back to Font A
  }

  /**
   * Print logo from base64 JPEG/PNG (via canvas → ESC/POS raster)
   * maxWidth dots: 58mm ≈ 384 dots, we use ~200 for a neat logo
   */
  async printLogo(base64, maxWidth = 200) {
    if (!base64) return;
    try {
      const src = base64.startsWith('data:') ? base64 : ('data:image/jpeg;base64,' + base64);
      const img = await new Promise((resolve, reject) => {
        const i = new Image();
        i.onload = () => resolve(i);
        i.onerror = reject;
        i.src = src;
      });

      let w = maxWidth;
      let h = Math.round((img.height / img.width) * w);
      // width must be multiple of 8 for raster
      w = Math.floor(w / 8) * 8;
      if (w < 8) w = 8;

      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);

      const imageData = ctx.getImageData(0, 0, w, h);
      const pixels = imageData.data;
      const bytesPerRow = w / 8;
      const raster = new Uint8Array(bytesPerRow * h);

      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const i = (y * w + x) * 4;
          const gray = (pixels[i] + pixels[i + 1] + pixels[i + 2]) / 3;
          // threshold: dark pixels print
          if (gray < 140) {
            raster[y * bytesPerRow + (x >> 3)] |= (0x80 >> (x & 7));
          }
        }
      }

      // Center align
      await this.write(new Uint8Array([0x1b, 0x61, 0x01]));
      // GS v 0 — raster bit image
      const xL = bytesPerRow & 0xff;
      const xH = (bytesPerRow >> 8) & 0xff;
      const yL = h & 0xff;
      const yH = (h >> 8) & 0xff;
      const header = new Uint8Array([0x1d, 0x76, 0x30, 0x00, xL, xH, yL, yH]);
      await this.write(header);
      await this.write(raster);
      await this.write(new Uint8Array([0x0a])); // newline after logo
    } catch (e) {
      this.log('Logo print failed', e);
      // logo fail → silently continue without logo
    }
  }

  /* ===================== HIGH-LEVEL RECEIPTS ===================== */

  async printFeeReceipt(data) {
    const line = this._line();
    await this.init();

    // Logo (agar diya ho)
    if (data.logoBase64) {
      await this.printLogo(data.logoBase64, this.paperWidth <= 58 ? 160 : 240);
    }

    await this.printText('THE SMART MODERN', { align: 'center', bold: true });
    await this.printText('PUBLIC SCHOOL', { align: 'center', bold: true });
    await this.printText('Qamber', { align: 'center' });
    await this.printText(line, { align: 'center' });
    await this.printText('FEE RECEIPT', { align: 'center', bold: true, double: true });

    await this.printText('Receipt #: ' + (data.receiptNo || '—'));
    await this.printText('Date     : ' + (data.date || new Date().toLocaleDateString()));
    await this.printText('Student  : ' + (data.studentName || '—'), { bold: true });
    await this.printText('Class    : ' + (data.className || '—'));
    await this.printText('Amount   : Rs. ' + (data.amount || 0), { bold: true });
    await this.printText('Status   : ' + (data.status || 'Paid').toUpperCase());

    await this.printText(line, { align: 'center' });
    await this.printText('Thank you!', { align: 'center' });
    // Credit — chhota font
    await this.printSmall('Software by Fazul Khan Chandio', { align: 'center' });

    await this.feed(this.feedBeforeCut);
    await this.doCut();
  }

  async printTest() {
    const line = this._line();
    await this.init();
    await this.printText('=== PRINTER TEST ===', { align: 'center', bold: true });
    await this.printText(line, { align: 'center' });
    await this.printText('Paper: ' + this.paperWidth + 'mm', { align: 'center' });
    await this.printText(this.connectionType === 'usb' ? 'USB Connection' : 'Bluetooth', { align: 'center' });
    await this.printText(new Date().toLocaleString(), { align: 'center' });
    await this.printText(line, { align: 'center' });
    await this.printSmall('Software by Fazul Khan Chandio', { align: 'center' });
    await this.feed(this.feedBeforeCut);
    await this.doCut();
  }
}

// Global access — minimum paper waste for HiLabel 58mm
window.ThermalPrinter = ThermalPrinter;
window.schoolPrinter = new ThermalPrinter({
  debug: true,
  paperWidth: 58,        // 58mm paper (HiLabel)
  chunkSize: 48,         // reliable on Bluetooth
  chunkDelay: 40,        // ms
  feedBeforeCut: 0,      // ZERO extra feed — no blank paper
  usePartialCut: true    // partial cut, 0 feed units
});
