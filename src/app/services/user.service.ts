import { Injectable } from '@angular/core';
import { Http, Headers, RequestOptions } from '@angular/http';
import { AuthService } from './auth.service';
import { User } from '../register/user';

@Injectable()
export class UserService {
  options;
  domain = this.authService.domain;

  createAuthenticationHeaders() {
    this.authService.loadToken();
    this.options = new RequestOptions({
      headers: new Headers({
        'Content-Type': 'application/json',
        'authorization': this.authService.authToken
      })
    });
  }

  getUserInfo() {
    this.createAuthenticationHeaders();
    return this.http.get(this.domain + '/api/getUserInfo', this.options).map(res => res.json());
  }
  saveUserChanges(user: User) {
    this.createAuthenticationHeaders();
    return this.http.post(this.domain + '/api/saveUserChanges', user, this.options).map(res => res.json());
  }

  constructor(
    private authService: AuthService,
    private http: Http
  ) { }

}