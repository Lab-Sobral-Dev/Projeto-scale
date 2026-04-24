import os
from django.contrib import admin
from django.urls import path, include

_admin_url = os.environ.get("DJANGO_ADMIN_URL", "admin/").strip("/") + "/"

urlpatterns = [
    path(_admin_url, admin.site.urls),
    path('api/registro/', include('registro.urls')),
    path('api/usuarios/', include('usuarios.urls')),
    path('api/reports/', include('reports.urls')), 
]
