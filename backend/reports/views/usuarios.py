# apps/reports/views/usuarios.py
from rest_framework.views import APIView
from rest_framework.response import Response
from django.contrib.auth import get_user_model
from usuarios.models import PerfilUsuario, Role, Screen
from ..serializers import UsuarioListSerializer
from ..permissions import IsReportViewer
from ..services.exporters import export_csv, export_pdf
from ..filters import text

User = get_user_model()

class UsuariosReportView(APIView):
    permission_classes = [IsReportViewer]
    def get(self, request):
        perfil = text(request, 'perfil')  # operador/supervisor/admin
        nome = text(request, 'nome')
        email = text(request, 'email')
        status = text(request, 'status')  # true/false

        qs = User.objects.select_related('perfil').all()
        if perfil:
            qs = qs.filter(perfil__papel=perfil)
        if nome:
            qs = qs.filter(username__icontains=nome) | qs.filter(first_name__icontains=nome) | qs.filter(last_name__icontains=nome)
        if email:
            qs = qs.filter(email__icontains=email)
        if status in ('true','false'):
            qs = qs.filter(is_active=(status=='true'))

        export = request.GET.get('export')
        header = ["ID","Usuário","Nome","Sobrenome","Email","Último login","Ativo","Perfil"]
        rows = [[u.id, u.username, u.first_name, u.last_name, u.email, (u.last_login.strftime("%Y-%m-%d %H:%M") if u.last_login else "—"), "Sim" if u.is_active else "Não", getattr(u.perfil, 'papel', '—')] for u in qs]

        if export == 'csv':
            return export_csv("usuarios", header, rows)
        if export == 'pdf':
            return export_pdf("usuarios", "Relatório de Usuários", header, rows)
        return Response(UsuarioListSerializer(qs, many=True).data)

class PermissoesTelasReportView(APIView):
    permission_classes = [IsReportViewer]
    def get(self, request):
        perfil = text(request, 'perfil')
        usuario = text(request, 'usuario')

        # matriz de acesso: usuário → telas (via roles + extras)
        qs = User.objects.select_related('perfil').all()
        if perfil:
            qs = qs.filter(perfil__papel=perfil)
        if usuario:
            qs = qs.filter(username__icontains=usuario)

        export = request.GET.get('export')
        header = ["Usuário","Perfil","Telas permitidas (codes)"]
        rows, data = [], []
        for u in qs:
            telas = getattr(u.perfil, 'get_allowed_screens', lambda: [])()
            rows.append([u.username, getattr(u.perfil, 'papel','—'), ", ".join(telas)])
            data.append({"usuario":u.username, "perfil":getattr(u.perfil,'papel','—'), "telas":telas})

        if export == 'csv':
            return export_csv("permissoes_telas", header, rows)
        if export == 'pdf':
            return export_pdf("permissoes_telas", "Permissões e Telas", header, rows)
        return Response(data)
