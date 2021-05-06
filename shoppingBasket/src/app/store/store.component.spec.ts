import { ComponentFixture, TestBed } from '@angular/core/testing';
import { StoreComponent } from './store.component';
import * as inventory from './inventory.json';

describe('StoreComponent', () => {
  let component: StoreComponent;
  let fixture: ComponentFixture<StoreComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ StoreComponent ]
    })
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(StoreComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('ngOnInit populates catalog with inventory', () => {
    component.catalog = [];
    component.ngOnInit();
    expect(component.catalog).toEqual(inventory.catalogItems);
  });

  it('ngOnInit should call newBasket', () => {
    spyOn(component, 'newBasket');
    component.ngOnInit();
    expect(component.newBasket).toHaveBeenCalled();
  });

  it('newBasket empties the shopping basket', () => {
    component.basket = ['foo', 'bar'];
    component.newBasket();
    expect(component.basket).toEqual([]);
  });

  it('addToBasket populates basket with catalog item', () => {
    component.catalog = inventory.catalogItems;
    component.addToBasket(0);
    expect(component.basket).toEqual([component.catalog[0]]);
  });

  it('addToBasket leaves basket unchanged with invalid index', () => {
    component.catalog = inventory.catalogItems;
    component.addToBasket(99);
    expect(component.basket).toEqual([]);
  });

  it('removeItem removes selected item from basket', () => {
    component.basket = ['foo', 'bar'];
    component.removeItem(0);
    expect(component.basket).toEqual(['bar']);
  });

  it('removeItem leaves basket unchanged with invalid index', () => {
    component.basket = ['foo', 'bar'];
    component.removeItem(99);
    expect(component.basket).toEqual(['foo', 'bar']);
  });

  it('cash formats number to string', () => {
    let cashStr = component.cash(1000000);
    expect(cashStr).toBe('1,000,000.00');
  });

  it('printReciept creates reciept of same length as basket', () => {
    component.basket = inventory.catalogItems;
    component.printReceipt();
    expect(component.receipt.length).toBe(inventory.catalogItems.length);
  });

  it('printReciept adds taxIncludedPrice to items', () => {
    component.basket = [{"title": "foo", "price": 0.99, "taxExempt": true, "imported": false }];
    component.printReceipt();
    expect(Object.keys(component.receipt[0])).toContain('taxIncludedPrice');
  });

  it('printReciept calculates taxes', () => {
    component.taxes = '';
    component.basket = [{"title": "foo", "price": 0.99, "taxExempt": true, "imported": false }];
    component.printReceipt();
    expect(component.taxes).toBeTruthy();
  });

  it('printReciept calculates total', () => {
    component.total = '';
    component.basket = [{"title": "foo", "price": 0.99, "taxExempt": true, "imported": false }];
    component.printReceipt();
    expect(component.total).toBeTruthy();
  });

  it('printReciept calls cash for each item, taxes, and total', () => {
    component.basket = inventory.catalogItems;
    const numCalls = inventory.catalogItems.length + 2;
    const cashSpy = spyOn(component, 'cash');
    component.printReceipt();
    expect(cashSpy.calls.count()).toBe(numCalls);
  });

  it('printReciept calls newBasket', () => {
    spyOn(component, 'newBasket');
    component.printReceipt();
    expect(component.newBasket).toHaveBeenCalled();
  });
});
