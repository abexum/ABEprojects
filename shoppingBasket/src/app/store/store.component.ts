import { Component, OnInit } from '@angular/core';
import * as inventory from './inventory.json';

@Component({
  selector: 'app-store',
  templateUrl: './store.component.html',
  styleUrls: ['./store.component.scss']
})
export class StoreComponent implements OnInit {
  // receipt!: string;
  basket: any[] = [];
  catalog: any[] = [];

  constructor() { }

  ngOnInit(): void {
    this.newBasket();
  }

  newBasket() {
    this.catalog = inventory.catalogItems.map(item => item.title);
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

}
