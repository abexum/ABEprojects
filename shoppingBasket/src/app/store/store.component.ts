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

    this.receipt = this.basket;

    const round  = (tax: number) => Math.ceil(tax*20)/20;
    const cash = (price: number) => price.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

    const { salesTax, importDuty } = inventory.taxes;

    this.receipt.forEach(item => {
      let { price, taxExempt, imported } = item;
      totalC += price;

      let itemTax: number = 0;
      if (!taxExempt) itemTax += round(salesTax*price);
      if (imported) itemTax += round(importDuty*price);

      item.taxIncludedPrice = cash(item.price + itemTax);
      taxesC += itemTax;
      totalC += itemTax;

    });

    this.total = cash(totalC);
    this.taxes = cash(taxesC);

    this.newBasket();
  }

}
