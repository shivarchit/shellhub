Name:           shellhub
Version:        0.1.2
Release:        1%{?dist}
Summary:        Lightweight web-based SSH client and server management tool

License:        MIT
URL:            https://github.com/shivarchit/shellhub

%description
A lightweight web-based SSH client and server management tool. Connect to your servers, run commands, and manage quick shortcuts — all from the browser.

%prep
# Nothing to prep, binary is pre-compiled

%build
# Nothing to build, binary is pre-compiled

%install
mkdir -p %{buildroot}/usr/local/bin
mkdir -p %{buildroot}/usr/share/applications
mkdir -p %{buildroot}/usr/share/pixmaps

cp %{_sourcedir}/shellhub %{buildroot}/usr/local/bin/shellhub
cp %{_sourcedir}/shellhub.desktop %{buildroot}/usr/share/applications/shellhub.desktop
cp %{_sourcedir}/shellhub.png %{buildroot}/usr/share/pixmaps/shellhub.png

%files
/usr/local/bin/shellhub
/usr/share/applications/shellhub.desktop
/usr/share/pixmaps/shellhub.png

%changelog
* Sun Jun 14 2026 Shivarchit <shivarchit@users.noreply.github.com> - 0.1.2-1
- Initial RPM package release
