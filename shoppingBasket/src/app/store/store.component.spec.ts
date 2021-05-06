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

  // onInit calls newBasket

  // newBasket populates catalog with inventory
  // newBasket empties the shopping basket

  it('should have catalog populated with inventory', () => {
    expect(component.catalog).toEqual(inventory.catalogItems);
  });

  it('should have empty shopping basket onInit', () => {
    expect(component.basket).toEqual([]);
  });

  it('should have empty receipt onInit', () => {
    expect(component.receipt).toEqual([]);
  });

  // add to basket populates basket with catalog item
  // add to basket leaves basket unchanged with invalid index
  // remove item removes selected item from basket
  // remove item leaves basket unchanged with invalid index

  // cash formats number to string

  // print reciept creates receipt with items from basket
  // print reciept adds taxIncludedPrice to items
  //  -- taxes rounded to 0.05
  // print reciept calculates taxes
  // print reciept calculates total
  // printReciept calls cash for each item, taxes, and total
  // print reciept calls newBasket
});
