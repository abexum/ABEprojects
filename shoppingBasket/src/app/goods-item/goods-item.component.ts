import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-goods-item',
  template: `
    <button>{{ title }}<br>$ {{ price }}</button>
  `,
  styles: [
  ]
})
export class GoodsItemComponent {

  @Input() title: string = '';
  @Input() price: string = '';

}
