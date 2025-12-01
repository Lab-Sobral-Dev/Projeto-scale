from django.contrib import admin, messages
from django.utils.html import format_html
from django.utils.safestring import mark_safe
from django.urls import reverse, path
from django.http import HttpResponseRedirect, HttpResponse
from django.template import Template, Context
from django.db import models
from django.utils.timezone import now
import json

from .models import (
    Produto, MateriaPrima, Balanca,
    EstruturaProduto, ItemEstrutura,
    OrdemProducao, ItemOP, Pesagem
)

# === IMPORTS PARA BACKUP ===
from registro.backup import BackupRecord   # modelo de backup
from registro.backup_config import BackupConfig  # configuração de backup automático
# Importamos run_restore para permitir a restauração
from .services.backup_db import run_full_backup, run_restore
from .services.backup_notify import notify_backup_failure  # envio de e-mail em falha
from .audit_models import AuditLog  # modelo de auditoria


# --- Produtos / MPs ---

@admin.register(Produto)
class ProdutoAdmin(admin.ModelAdmin):
    list_display = ("nome", "codigo_interno", "ativo")
    search_fields = ("nome", "codigo_interno")
    list_filter = ("ativo",)


@admin.register(MateriaPrima)
class MateriaPrimaAdmin(admin.ModelAdmin):
    list_display = ("nome", "codigo_interno", "ativo")
    search_fields = ("nome", "codigo_interno")
    list_filter = ("ativo",)


class ItemEstruturaInline(admin.TabularInline):
    model = ItemEstrutura
    extra = 0


@admin.register(EstruturaProduto)
class EstruturaProdutoAdmin(admin.ModelAdmin):
    list_display = ("produto", "descricao", "ativo")
    list_filter = ("ativo", "produto")
    search_fields = ("produto__nome", "descricao")
    inlines = [ItemEstruturaInline]


class ItemOPInline(admin.TabularInline):
    model = ItemOP
    extra = 0
    autocomplete_fields = ("materia_prima",)


@admin.register(OrdemProducao)
class OrdemProducaoAdmin(admin.ModelAdmin):
    list_display = ("numero", "produto", "lote", "status", "criada_em", "concluida_em")
    list_filter = ("status", "produto", "criada_em")
    search_fields = ("numero", "lote", "produto__nome")
    date_hierarchy = "criada_em"
    inlines = [ItemOPInline]


@admin.register(Balanca)
class BalancaAdmin(admin.ModelAdmin):
    list_display = ("nome", "identificador", "tipo_conexao", "ativo", "localizacao")
    list_filter = ("ativo", "tipo_conexao")
    search_fields = ("nome", "identificador", "endereco_ip", "porta_serial")


# -------- Pesagem --------

from .models import Produto as _Produto, MateriaPrima as _MateriaPrima, Pesagem as _Pesagem  # alias só pra uso nos filtros


class ProdutoDaOPFilter(admin.SimpleListFilter):
    title = "Produto"
    parameter_name = "produto"

    def lookups(self, request, model_admin):
        qs = _Produto.objects.order_by("nome").values_list("id", "nome")
        return [(str(i), n) for i, n in qs]

    def queryset(self, request, queryset):
        if self.value():
            return queryset.filter(op__produto_id=self.value())
        return queryset


class MateriaPrimaFilter(admin.SimpleListFilter):
    title = "Matéria-prima"
    parameter_name = "materia_prima"

    def lookups(self, request, model_admin):
        qs = _MateriaPrima.objects.order_by("nome").values_list("id", "nome")
        return [(str(i), n) for i, n in qs]

    def queryset(self, request, queryset):
        if self.value():
            return queryset.filter(item_op__materia_prima_id=self.value())
        return queryset


class LoteMPFilter(admin.SimpleListFilter):
    title = "Lote MP"
    parameter_name = "lote_mp"

    def lookups(self, request, model_admin):
        valores = (
            _Pesagem.objects.exclude(lote_mp="")
            .values_list("lote_mp", flat=True)
            .distinct()
            .order_by("lote_mp")[:50]
        )
        return [(v, v) for v in valores]

    def queryset(self, request, queryset):
        if self.value():
            return queryset.filter(lote_mp=self.value())
        return queryset


@admin.register(Pesagem)
class PesagemAdmin(admin.ModelAdmin):
    list_display = (
        "data_hora",
        "produto",          # via método
        "materia_prima",    # via método
        "lote",             # via método (lote da OP)
        "lote_mp",
        "liquido",
        "bruto",
        "tara",
        "pesador",
        "balanca",
        "codigo_interno",
    )
    ordering = ("-data_hora",)
    search_fields = (
        "pesador",
        "codigo_interno",
        "lote_mp",
        "op__numero",
        "op__lote",
        "op__produto__nome",
        "item_op__materia_prima__nome",
    )
    date_hierarchy = "data_hora"
    list_filter = (
        ProdutoDaOPFilter,
        MateriaPrimaFilter,
        LoteMPFilter,
        "balanca",
        "data_hora",
    )
    list_select_related = (
        "op",
        "item_op",
        "balanca",
        "op__produto",
        "item_op__materia_prima",
    )

    # Colunas virtuais
    def produto(self, obj):
        return obj.op.produto
    produto.admin_order_field = "op__produto__nome"
    produto.short_description = "Produto"

    def materia_prima(self, obj):
        return obj.item_op.materia_prima
    materia_prima.admin_order_field = "item_op__materia_prima__nome"
    materia_prima.short_description = "Matéria-prima"

    def lote(self, obj):
        return obj.op.lote
    lote.admin_order_field = "op__lote"
    lote.short_description = "Lote (OP)"


# -------- AuditLog (somente leitura) --------

from .audit_models import AuditLog


@admin.register(AuditLog)
class AuditLogAdmin(admin.ModelAdmin):
    """
    Admin de auditoria:
    - somente leitura (não permite adicionar/editar/excluir)
    - filtros por campos-chave
    - pretty JSON para 'changes' e 'extra'
    """
    date_hierarchy = "timestamp"
    ordering = ("-timestamp",)
    list_per_page = 50
    list_select_related = ("user",)

    # colunas
    list_display = (
        "timestamp",
        "action",
        "model",
        "object_pk",
        "user",
        "ip",
        "method",
        "status_code",
        "path_short",
    )

    # filtros laterais
    list_filter = (
        "action",
        "method",
        "status_code",
        "model",
        "ip",
        ("user", admin.RelatedOnlyFieldListFilter),
        "timestamp",
    )

    # busca
    search_fields = (
        "path",
        "model",
        "object_pk",
        "user__username",
        "user_agent",
        "ip",
    )

    readonly_fields = (
        "timestamp",
        "user",
        "ip",
        "user_agent_pre",
        "path",
        "method",
        "status_code",
        "action",
        "model",
        "object_pk",
        "changes_pre",
        "extra_pre",
    )

    fieldsets = (
        ("Contexto da Requisição", {
            "fields": ("timestamp", "user", "ip", "user_agent_pre", "path", "method", "status_code")
        }),
        ("Alvo", {
            "fields": ("action", "model", "object_pk")
        }),
        ("Detalhes", {
            "fields": ("changes_pre", "extra_pre")
        }),
    )

    # Helpers de exibição

    def path_short(self, obj):
        s = obj.path or ""
        return s if len(s) <= 60 else s[:57] + "…"
    path_short.short_description = "Path"

    def _pre_json(self, data):
        if data is None:
            return "-"
        try:
            pretty = json.dumps(data, indent=2, ensure_ascii=False, default=str)
        except Exception:
            # fallback para string crua
            pretty = str(data)
        return mark_safe(
            "<pre style='white-space:pre-wrap;max-height:400px;overflow:auto;margin:0'>{}</pre>".format(pretty)
        )

    def user_agent_pre(self, obj):
        ua = obj.user_agent or ""
        return mark_safe(f"<pre style='white-space:pre-wrap;margin:0'>{ua}</pre>")
    user_agent_pre.short_description = "User-Agent"

    def changes_pre(self, obj):
        return self._pre_json(obj.changes)
    changes_pre.short_description = "Alterações (JSON)"

    def extra_pre(self, obj):
        return self._pre_json(obj.extra)
    extra_pre.short_description = "Extras (JSON)"

    # Somente leitura
    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


# -------- Backups (executar + baixar + RESTAURAR via Admin) --------

@admin.register(BackupRecord)
class BackupRecordAdmin(admin.ModelAdmin):
    """
    - Clique no botão verde "Adicionar Backup record" para executar um backup agora.
    - Lista mostra status, hash, tamanho, link de download e RESTAURAR (Admin).
    """
    date_hierarchy = "created_at"
    ordering = ("-created_at",)
    list_per_page = 25
    list_select_related = ("executed_by",)

    list_display = (
        "created_at",
        "executed_by",
        "engine",
        "size_mb",
        "sha_short",
        "status_badge",
        "acoes",
    )
    readonly_fields = (
        "created_at",
        "executed_by",
        "ip",
        "user_agent",
        "engine",
        "output_file",
        "size_bytes",
        "sha256",
        "status",
        "error_message",
    )

    fieldsets = (
        ("Informações do Backup", {
            "fields": (
                "created_at", "executed_by", "ip", "user_agent",
                "engine", "output_file", "size_bytes", "sha256",
                "status", "error_message",
            )
        }),
    )

    # ===== Configuração de URLs para Ação Customizada (Restore) =====
    def get_urls(self):
        urls = super().get_urls()
        custom_urls = [
            path(
                '<int:backup_id>/restore/',
                self.admin_site.admin_view(self.restore_view),
                name='registro_backuprecord_restore',
            ),
        ]
        return custom_urls + urls

    # ===== View Customizada de Restore com Confirmação =====
    def restore_view(self, request, backup_id):
        # Segurança: Apenas Superusuários podem restaurar via Admin
        if not request.user.is_superuser:
            messages.error(request, "Ação não permitida. Apenas superusuários podem restaurar backups.")
            return HttpResponseRedirect(reverse('admin:registro_backuprecord_changelist'))

        # Busca o objeto
        obj = self.get_object(request, backup_id)
        if not obj:
            messages.error(request, "Backup não encontrado.")
            return HttpResponseRedirect(reverse('admin:registro_backuprecord_changelist'))

        # Se for POST, executa a ação
        if request.method == 'POST':
            try:
                user_info = f"{request.user.username} (Admin) - IP: {request.META.get('REMOTE_ADDR')}"
                # Chama a função blindada que faz o snapshot de segurança antes
                run_restore(obj.output_file, user_info=user_info)
                
                messages.success(
                    request, 
                    f"SUCESSO: Sistema restaurado para a versão de {obj.created_at}. "
                    "Um backup de segurança dos dados anteriores foi criado automaticamente."
                )
            except Exception as e:
                messages.error(request, f"FALHA CRÍTICA no restore: {str(e)}")
            
            return HttpResponseRedirect(reverse('admin:registro_backuprecord_changelist'))

        # Se for GET, exibe página de confirmação (sem precisar de arquivo HTML extra)
        # Usamos o template base do admin para manter o estilo
        template = Template("""
            {% extends "admin/base_site.html" %}
            {% block content %}
            <div style="max-width: 800px; margin: 20px auto; padding: 20px; background: #fff; border: 1px solid #ddd; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                <h1 style="color: #dc2626; border-bottom: 1px solid #eee; padding-bottom: 10px;">⚠️ Confirmar Restauração de Banco de Dados</h1>
                
                <p style="font-size: 16px; margin: 20px 0;">
                    Você está prestes a restaurar o backup de: <strong>{{ obj.created_at|date:"d/m/Y H:i:s" }}</strong>
                </p>

                <div style="background: #fff5f5; border-left: 4px solid #dc2626; padding: 15px; margin-bottom: 20px;">
                    <h3 style="margin-top: 0; color: #9b2c2c;">ATENÇÃO - LEIA ANTES DE CONTINUAR:</h3>
                    <ul style="color: #742a2a;">
                        <li>Todos os dados atuais serão <strong>SUBSTITUÍDOS</strong> pelos dados deste backup.</li>
                        <li>Os dados inseridos após {{ obj.created_at|date:"d/m/Y H:i" }} desaparecerão da visualização atual.</li>
                        <li>O sistema criará automaticamente um <strong>Backup de Segurança</strong> (Snapshot) do estado atual antes de prosseguir.</li>
                    </ul>
                </div>

                <form method="post">
                    {% csrf_token %}
                    <div style="display: flex; justify-content: flex-end; gap: 10px;">
                        <a href="../" class="button" style="background: #f3f4f6; color: #374151; padding: 10px 20px; text-decoration: none; border-radius: 4px;">Cancelar</a>
                        <input type="submit" value="Sim, Restaurar Sistema" 
                               style="background: #dc2626; color: white; border: none; padding: 10px 20px; border-radius: 4px; cursor: pointer; font-weight: bold;">
                    </div>
                </form>
            </div>
            {% endblock %}
        """)
        
        context = Context(self.admin_site.each_context(request))
        context.update({'obj': obj})
        
        return HttpResponse(template.render(context))

    # ===== Helpers de exibição =====
    def size_mb(self, obj):
        if not obj.size_bytes:
            return "0.00 MB"
        return f"{obj.size_bytes/1024/1024:.2f} MB"
    size_mb.short_description = "Tamanho"

    def sha_short(self, obj):
        s = obj.sha256 or ""
        return s[:12] + "…" if s else "-"
    sha_short.short_description = "SHA256"

    def status_badge(self, obj):
        color = "#16a34a" if obj.status == "success" else "#dc2626"
        label = "OK" if obj.status == "success" else "Erro"
        return format_html(
            "<span style='display:inline-block;padding:2px 8px;border-radius:999px;color:#fff;background:{}'>{}</span>",
            color, label
        )
    status_badge.short_description = "Status"

    def acoes(self, obj):
        # Link de download para o Admin
        try:
            url_dl = reverse("admin-backup-download", args=[obj.pk])
        except Exception:
            # Fallback para rota direta se o nome reverso não existir
            url_dl = f"/api/registro/backups/{obj.pk}/download/"
        
        btn_dl = format_html('<a class="button" href="{}" target="_blank">Baixar</a>', url_dl)
        
        # Link de Restore (Botão Vermelho) - Apenas se sucesso e disponível
        btn_restore = ""
        if obj.status == "success":
            url_restore = reverse("admin:registro_backuprecord_restore", args=[obj.pk])
            btn_restore = format_html(
                '<a class="button" style="background-color:#dc2626; color:white; margin-left:8px;" href="{}">Restaurar</a>',
                url_restore
            )
        
        return format_html('{} {}', btn_dl, btn_restore)
    acoes.short_description = "Ações"

    # ===== Execução do backup ao clicar em "Adicionar" =====
    def has_add_permission(self, request):
        return bool(request.user and request.user.is_staff)

    def add_view(self, request, form_url="", extra_context=None):
        user = request.user if request.user.is_authenticated else None
        ip = request.META.get("REMOTE_ADDR")
        ua = request.META.get("HTTP_USER_AGENT", "")
        rec = BackupRecord.objects.create(
            executed_by=user,
            ip=ip,
            user_agent=ua,
            engine="",
            output_file="",
            size_bytes=0,
            sha256="",
            status="success",
        )
        try:
            result = run_full_backup()
            rec.engine = result["engine"]
            rec.output_file = result["output_file"]
            rec.size_bytes = result["size_bytes"]
            rec.sha256 = result["sha256"]
            rec.status = "success"
            rec.save()

            # Auditoria
            try:
                AuditLog.objects.create(
                    user=user, ip=ip, user_agent=ua, path=request.path,
                    method="POST", status_code=200, action="create",
                    model="BackupRecord", object_pk=str(rec.pk),
                    changes={"file": rec.output_file, "size": rec.size_bytes},
                )
            except Exception:
                pass

            messages.success(request, "Backup concluído com sucesso.")
        except Exception as e:
            rec.status = "error"
            rec.error_message = str(e)
            rec.save()

            notify_backup_failure(
                error_message=str(e),
                rec=rec,
                context={"source": "admin_manual_backup", "user": getattr(user, "username", None)},
            )
            messages.error(request, f"Falha ao executar backup: {e}")

        changelist_url = reverse(
            f"admin:{BackupRecord._meta.app_label}_{BackupRecord._meta.model_name}_changelist"
        )
        return HttpResponseRedirect(changelist_url)

    # Sem edição/exclusão manual via Admin
    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return bool(request.user and request.user.is_superuser)


# -------- Configuração de Backup Automático --------

@admin.register(BackupConfig)
class BackupConfigAdmin(admin.ModelAdmin):
    list_display = (
        "enabled",
        "schedule_type",
        "time_of_day",
        "interval_hours",
        "retention_days",
        "updated_at",
    )
    readonly_fields = ("updated_at",)

    fieldsets = (
        ("Status", {
            "fields": ("enabled",),
        }),
        ("Agendamento", {
            "fields": ("schedule_type", "time_of_day", "interval_hours"),
            "description": "Escolha entre horário diário fixo ou intervalo em horas.",
        }),
        ("Retenção", {
            "fields": ("retention_days",),
            "description": "Dias para manter backups antigos antes de deletar.",
        }),
        ("Metadados", {
            "fields": ("updated_at",),
        }),
    )

    def has_add_permission(self, request):
        if BackupConfig.objects.exists():
            return False
        return super().has_add_permission(request)