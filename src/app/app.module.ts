import { BrowserModule } from '@angular/platform-browser';
import { NgModule } from '@angular/core';
import { HttpClientModule } from '@angular/common/http';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { FormsModule } from '@angular/forms';

import { MdButtonModule, MatInputModule, MatDialogModule, MatListModule, MatCardModule } from '@angular/material';

import { AppComponent } from './app.component';
import { HomeComponent, LinkAnimeDialog } from './home/home.component';
import { HomeModule } from './home/home.module';

@NgModule({
  declarations: [
    AppComponent,
    HomeComponent,
    LinkAnimeDialog
  ],
  imports: [
    BrowserModule,
    HttpClientModule,
    BrowserAnimationsModule,
    MdButtonModule,
    MatInputModule,
    MatDialogModule,
    FormsModule,
    MatListModule,
    MatCardModule
  ],
  providers: [],
  bootstrap: [AppComponent],
  entryComponents: [LinkAnimeDialog]
})
export class AppModule { }
