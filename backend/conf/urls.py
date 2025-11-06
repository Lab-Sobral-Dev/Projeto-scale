from django.contrib import admin
from django.urls import path, include

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/registro/', include('registro.urls')),
    path('api/usuarios/', include('usuarios.urls')),
    path('api/reports/', include('reports.urls')), 
]
