; RayTeX: what the installer of Windows does besides Tauri's own.
;
; The slides mode is offered by a box on the first page (not ticked: the
; mode is optional). Ticked, the installer leaves a file next to the
; program; RayTeX reads it at its next start (the mode is then installed,
; and can be taken off in its settings) and deletes it. Not shown in the
; quiet installs of the updates, which keep what was chosen.

!include LogicLib.nsh
!include nsDialogs.nsh

Var SlidesBox
Var SlidesWanted

; The first page Tauri's installer shows (the welcome page) gets the box.
!define MUI_PAGE_CUSTOMFUNCTION_SHOW RayTeXSlidesShow
!define MUI_PAGE_CUSTOMFUNCTION_LEAVE RayTeXSlidesLeave

Function RayTeXSlidesShow
  ${NSD_CreateCheckbox} 120u 172u 195u 12u "Also install the slides mode (Beamer presentations)"
  Pop $SlidesBox
  SetCtlColors $SlidesBox "" "FFFFFF"
  ${If} $SlidesWanted == ${BST_CHECKED}
    ${NSD_Check} $SlidesBox
  ${EndIf}
FunctionEnd

Function RayTeXSlidesLeave
  ${NSD_GetState} $SlidesBox $SlidesWanted
FunctionEnd

!macro NSIS_HOOK_POSTINSTALL
  ${If} $SlidesWanted == ${BST_CHECKED}
    FileOpen $0 "$INSTDIR\slides-mode.install" w
    FileWrite $0 "1"
    FileClose $0
  ${EndIf}
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  Delete "$INSTDIR\slides-mode.install"
!macroend
