import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-goods-item',
  template: `
    <button nbButton hero status="warning" *ngIf="!taxExempt && !imported">{{ title }}<br>$ {{ price }}</button>
    <button nbButton hero status="success" *ngIf="taxExempt && !imported">{{ title }}<br>$ {{ price }}</button>
    <button nbButton hero status="info" *ngIf="taxExempt && imported">{{ title }}<br>$ {{ price }}</button>
    <button nbButton hero status="primary" *ngIf="!taxExempt && imported">{{ title }}<br>$ {{ price }}</button>
  `,
  styles: ['button { width: 100%; height: 100%; font-size: 1em; }']
})
export class GoodsItemComponent {

  @Input() title: string = '';
  @Input() price: string = '';
  @Input() taxExempt: boolean = false;
  @Input() imported: boolean = false;

}
