import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-receipt',
  template: `
    <li>1 {{ title }}: {{ price }}</li>
  `,
  styles: [
  ]
})

export class ReceiptComponent {

  // @Input() items: object[] = [];
  // @Input() salesTax: string = '';
  // @Input() total: string = '';
  @Input() title: string = '';
  @Input() price: number = 0.00;

  

  constructor() { 
  }

}
