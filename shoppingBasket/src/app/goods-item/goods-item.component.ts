import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-goods-item',
  template: `
    <button>{{ title }}<br>{{ price.toFixed(2) }}</button>
  `,
  styles: [
  ]
})
export class GoodsItemComponent {

  @Input() title: string = '';
  @Input() price: number = 0.00;
  // price: number;
  // taxExempt: boolean;
  // imported: boolean;

}
