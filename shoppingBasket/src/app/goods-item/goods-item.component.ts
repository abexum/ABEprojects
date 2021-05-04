import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-goods-item',
  template: `
    <button>{{ title }}</button>
  `,
  styles: [
  ]
})
export class GoodsItemComponent {

  @Input() title: string = '';
  // price: number;
  // taxExempt: boolean;
  // imported: boolean;

}
