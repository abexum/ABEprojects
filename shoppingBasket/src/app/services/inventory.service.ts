import { Injectable } from '@angular/core';
import * as inventory from './inventory.json';

@Injectable({
  providedIn: 'root'
})
export class InventoryService {

  constructor() { }

  async fakeWait(apiName: string){
    const delay = new Promise<void>((done) => setTimeout(() => done(), 1000))

    return delay;
  }

  async getCatalogItems() {
    await this.fakeWait('getCatalogItems');
    return inventory.catalogItems;
  }

  async getSalesTax() {
    await this.fakeWait('getSalesTax');
    return inventory.taxes.salesTax;
  }

  async getImportDuty() {
    await this.fakeWait('getImportDuty');
    return inventory.taxes.importDuty;
  }
}
