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

  it('should have catalog populated with inventory', () => {
    expect(component.catalog).toEqual(inventory.catalogItems);
  });

  it('should have empty shopping basket', () => {
    expect(component.basket).toEqual([]);
  });
  
  it('should have empty receipt', () => {
    expect(component.receipt).toEqual([]);
  });
});
