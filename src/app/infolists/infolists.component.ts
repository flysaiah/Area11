import { Component, OnInit } from '@angular/core'
import { MatDialog } from '@angular/material'
import { ConfirmDialogComponent } from '../app.component'
import { AuthService } from '../services/auth.service'
import { InfolistService } from '../services/infolist.service'
import { Infolist } from './infolist'

@Component({
  selector: 'app-infolists',
  templateUrl: './infolists.component.html',
  styleUrls: ['./infolists.component.css'],
})
export class InfolistsComponent implements OnInit {
  currentUser: string
  refreshHeader: number
  isLoading: boolean

  showToast: boolean
  toastMessage: string
  toastError: boolean

  newInfolistName: string
  currentlyAddingNewInfolist: boolean

  allInfolists: Infolist[]
  allInfolistNames: string[] // Used for validation

  private displayToast(message: string, error?: boolean) {
    // Display toast in application with message and timeout after 3 sec
    this.showToast = true
    this.toastMessage = message
    if (error) {
      this.toastError = true
    }
    setTimeout(() => {
      this.showToast = false
      this.toastMessage = ''
      this.toastError = false
    }, 3000)
  }

  viewAll() {
    this.allInfolists.map(ilObj => {
      ilObj.isSelected = true
      return ilObj
    })
  }

  hideAll() {
    this.allInfolists.map(ilObj => {
      ilObj.isSelected = false
      return ilObj
    })
  }

  deleteEmptyRows(infolist: Infolist) {
    // delete all empty rows in infolist
    infolist.entries = infolist.entries.filter(entry => {
      if (!entry.anime && !entry.info) {
        return false
      }
      return true
    })
  }

  lockAnimeColumn(infolist: Infolist) {
    infolist.animeColumnUnlocked = false
  }

  lockInfoColumn(infolist: Infolist) {
    infolist.infoColumnUnlocked = false
  }

  unlockAnimeColumn(infolist: Infolist) {
    infolist.animeColumnUnlocked = true
  }

  unlockInfoColumn(infolist: Infolist) {
    infolist.infoColumnUnlocked = true
  }

  addNewEntry(infolist: Infolist) {
    const newBlankEntry = {
      anime: '',
      info: '',
    }
    infolist.entries.push(newBlankEntry)
  }

  addNewInfolist() {
    this.currentlyAddingNewInfolist = true
    const newInfolist = {
      name: this.newInfolistName,
      entries: [],
    }
    this.infolistService.addNewInfolist(newInfolist).subscribe(res => {
      if (res['success']) {
        this.newInfolistName = ''
        this.allInfolists.push(res['infolist'])
        this.allInfolistNames.push(res['infolist'].name)
      } else {
        this.displayToast('There was a problem adding a new info list.', true)
      }
      this.currentlyAddingNewInfolist = false
    })
  }

  saveChanges(infolist: Infolist) {
    this.infolistService.saveInfolist(infolist).subscribe(res => {
      if (res['success']) {
        this.displayToast('Info list saved successfully!')
      } else {
        this.displayToast('There was a problem saving your info list.', true)
      }
    })
  }

  deleteInfolist(infolist: Infolist, index: number) {
    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      data: { doIt: true },
    })

    dialogRef.afterClosed().subscribe(result => {
      // Result is the index of the anime they chose to link, if they chose to link one
      if (result) {
        this.infolistService.deleteInfolist(infolist).subscribe(res => {
          if (res['success']) {
            this.allInfolists.splice(index, 1)
            this.allInfolistNames.splice(index, 1)
          } else {
            this.displayToast('There was a problem deleting the info list.', true)
          }
        })
      }
    })
  }

  private generateInfolistNames() {
    this.allInfolistNames = []
    for (const infolist of this.allInfolists) {
      this.allInfolistNames.push(infolist.name)
    }
  }
  refresh() {
    this.infolistService.fetchInfolists().subscribe(res => {
      if (res['success'] && res['infolists']) {
        this.allInfolists = res['infolists']
        this.generateInfolistNames()
      } else if (!res['success']) {
        this.displayToast('There was a problem getting your info lists.', true)
      }
    })
    this.isLoading = false
  }

  constructor(private authService: AuthService, private infolistService: InfolistService, private dialog: MatDialog) {}

  ngOnInit() {
    this.isLoading = true
    this.allInfolists = []
    this.allInfolistNames = []
    this.currentlyAddingNewInfolist = false
    this.newInfolistName = ''

    this.authService.getProfile().subscribe(res => {
      if (res['success']) {
        this.currentUser = res['user']['username']
        this.refresh()
      } else {
        // If there was a problem we need to have them log in again
        this.authService.logout()
      }
    })
  }
}
