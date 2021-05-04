import { Component, OnInit } from '@angular/core';
import * as inventory from './inventory.json';

@Component({
  selector: 'app-store',
  templateUrl: './store.component.html',
  styleUrls: ['./store.component.scss']
})
export class StoreComponent implements OnInit {
  basket: any[] = [];
  catalog: any[] = [];
  receipt: any[] = [];
  total: string = '';
  taxes: string = '';

  constructor() { }

  ngOnInit(): void {
    this.newBasket();
  }

  newBasket() {
    this.catalog = inventory.catalogItems;
    this.basket = [];
  }

  addToBasket(idx: number) {
    if (this.catalog[idx]) {
      this.basket.push(this.catalog[idx]);
    }

  }
  removeItem(idx: number) {
    if (this.basket[idx]) {
      this.basket.splice(idx, 1);
    }
  }

  printReceipt() {
    let totalC: number = 0;
    let taxesC: number = 0;

    const round  = (tax: number) => Math.ceil(tax*20)/20;
    const { salesTax, importDuty } = inventory.taxes;
    const newline = '<br>';

    this.basket.forEach( item => {
      let { price, taxExempt, imported } = item;

      totalC += price;
      if (!taxExempt) taxesC += round(salesTax*price);
      if (imported) taxesC += round(importDuty*price);
    });
    totalC += taxesC;

    this.total = totalC.toFixed(2);
    this.taxes = taxesC.toFixed(2);

    this.receipt = this.basket;

    this.newBasket();
  }

}
