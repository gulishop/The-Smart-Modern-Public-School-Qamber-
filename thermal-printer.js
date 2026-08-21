/**
 * thermal-printer.js
 * HiLabel / SpeedX Bluetooth Thermal Printer for School PWA
 * The Smart Modern Public School Qamber
 */

export class ThermalPrinter {
  constructor(options = {}) {
    this.device = null;
    this.server = null;
    this.characteristic = null;
    this.isConnected = false;
    this.chunkSize = options.chunkSize || 80;
    this.chunkDelay = options.chunkDelay || 40;
    this.debug = options.debug || false;

    this.SERVICE_UUIDS = [
      '000018f0-0000-1000-8000-00805f9b34fb',
      'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
      '49535343-fe7d-4ae5-8fa9-9fafd205e455',
      '0000ff00-0000-1000-8000-00805f9b34fb',
      '0000ae30-0000-1000-8000-00805f9b34fb',
      '0000fff0-0000-1000-8000-00805f9b34fb'
    ];

    this.WRITE_CHAR_UUIDS = [
      '00002af1-0000-1000-8000-00805f9b34fb',
      'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
      '49535343-8841-43f4-a8d4-ecbe34729bb3',
      '0000ff02-0000-1000-8000-00805f9b34fb',
      '0000ae01-0000-1000-8000-00805f9b34fb',
      '0000fff1-0000-1000-8000-00805f9b34fb',
      '0000fff2-0000-1000-8000-00805f9b34fb'
    ];
  }

  log(...args) {
    if (this.debug) console.log('[Printer]', ...args);
  }

  async connect() {
    if (!navigator.bluetooth) {
      throw new Error('Web Bluetooth support nahi hai. Chrome/Edge (Android) use karo.');
    }

    this.device = await navigator.bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices: this.SERVICE_UUIDS
    });

    this.server = await this.device.gatt.connect();

    let found = false;
    for (const su of this.SERVICE_UUIDS) {
      try {
        const service = await this.server.getPrimaryService(su);
        for (const cu of this.WRITE_CHAR_UUIDS) {
          try {
            const char = await service.getCharacteristic(cu);
            if (char.properties.write || char.properties.writeWithoutResponse) {
              this.characteristic = char;
              found = true;
              break;
            }
          } catch (e) {}
        }
        if (found) break;
      } catch (e) {}
    }

    if (!found) {
      const services = await this.server.getPrimaryServices();
      for (const service of services) {
        const chars = await service.getCharacteristics();
        for (const char of chars) {
          if (char.properties.write || char.properties.writeWithoutResponse) {
            this.characteristic = char;
            found = true;
            break;
          }
        }
        if (found) break;
      }
    }

    if (!found) throw new Error('Printer characteristic nahi mili');

    this.isConnected = true;
    this.device.addEventListener('gattserverdisconnected', () => {
      this.isConnected = false;
    });

    return this.device.name || 'Printer';
  }

  async disconnect() {
    if (this.device?.gatt?.connected) await this.device.gatt.disconnect();
    this.isConnected = false;
    this.device = null;
    this.server = null;
    this.characteristic = null;
  }

  async write(data) {
    if (!this.isConnected || !this.characteristic) throw new Error('Printer connected nahi hai');
    const buffer = data instanceof Uint8Array ? data : new Uint8Array(data);

    for (let i = 0; i < buffer.length; i += this.chunkSize) {
      const chunk = buffer.slice(i, i + this.chunkSize);
      try {
        if (this.characteristic.properties.writeWithoutResponse) {
          await this.characteristic.writeValueWithoutResponse(chunk);
        } else {
          await this.characteristic.writeValue(chunk);
        }
      } catch (e) {
        await this.characteristic.writeValue(chunk);
      }
      if (i + this.chunkSize < buffer.length) {
        await new Promise(r => setTimeout(r, this.chunkDelay));
      }
    }
  }

  async init() { await this.write(new Uint8Array([0x1b, 0x40])); }

  async printText(text, opts = {}) {
    const { align = 'left', bold = false, double = false } = opts;
    if (align === 'center') await this.write(new Uint8Array([0x1b, 0x61, 0x01]));
    else if (align === 'right') await this.write(new Uint8Array([0x1b, 0x61, 0x02]));
    else await this.write(new Uint8Array([0x1b, 0x61, 0x00]));

    if (bold) await this.write(new Uint8Array([0x1b, 0x45, 0x01]));
    if (double) await this.write(new Uint8Array([0x1d, 0x21, 0x11]));

    await this.write(new TextEncoder().encode(text + '\n'));

    await this.write(new Uint8Array([0x1d, 0x21, 0x00]));
    await this.write(new Uint8Array([0x1b, 0x45, 0x00]));
  }

  async feed(n = 1) { await this.write(new Uint8Array([0x1b, 0x64, n])); }
  async cut() { await this.write(new Uint8Array([0x1d, 0x56, 0x00])); }

  async printFeeReceipt(data) {
    await this.init();
    await this.printText('THE SMART MODERN', { align: 'center', bold: true });
    await this.printText('PUBLIC SCHOOL', { align: 'center', bold: true });
    await this.printText('Qamber', { align: 'center' });
    await this.printText('------------------------', { align: 'center' });
    await this.printText('FEE RECEIPT', { align: 'center', bold: true, double: true });
    await this.feed(1);

    await this.printText('Receipt #: ' + (data.receiptNo || '—'));
    await this.printText('Date     : ' + (data.date || new Date().toLocaleDateString()));
    await this.printText('Student  : ' + (data.studentName || '—'));
    await this.printText('Class    : ' + (data.className || '—'));
    await this.printText('Amount   : Rs. ' + (data.amount || 0), { bold: true });
    await this.printText('Status   : ' + (data.status || 'Paid').toUpperCase());
    await this.feed(1);
    await this.printText('------------------------', { align: 'center' });
    await this.printText('Thank you!', { align: 'center' });
    await this.feed(3);
    await this.cut();
  }

  async printTest() {
    await this.init();
    await this.printText('=== SCHOOL PRINTER TEST ===', { align: 'center', bold: true });
    await this.printText('HiLabel / SpeedX', { align: 'center' });
    await this.printText('86:67:7A:0B:DE:C7', { align: 'center' });
    await this.feed(1);
    await this.printText(new Date().toLocaleString(), { align: 'center' });
    await this.feed(3);
    await this.cut();
  }
}

// Global access for easy use in the school PWA
window.ThermalPrinter = ThermalPrinter;
window.schoolPrinter = new ThermalPrinter({ debug: true });
