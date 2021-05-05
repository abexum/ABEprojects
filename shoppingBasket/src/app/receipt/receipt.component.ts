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

  @Input() title: string = '';
  @Input() price: string = '';

  constructor() { }

}
