import { ComponentFixture, TestBed } from '@angular/core/testing';

import { GoodsItemComponent } from './goods-item.component';

describe('GoodsItemComponent', () => {
  let component: GoodsItemComponent;
  let fixture: ComponentFixture<GoodsItemComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ GoodsItemComponent ]
    })
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(GoodsItemComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
