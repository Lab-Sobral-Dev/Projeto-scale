from django.db import migrations, models
from django.utils.text import slugify
import uuid

def forwards(apps, schema_editor):
    Pesagem = apps.get_model('registro', 'Pesagem')
    Balanca = apps.get_model('registro', 'Balanca')

    # 1) adicionar balanca_obj (se não existir) — esta operação será feita pela Migration operations
    # 2) mapear char -> FK
    cache = {}  # nome_balanca -> Balanca instance

    # Se a tabela tinha um campo char antigo, ele estará disponível no estado desta migração
    # (vamos assumir que a operação AddField acontece antes desta RunPython)
    for p in Pesagem.objects.all().only('id', 'balanca', 'balanca_obj'):
        antigo = getattr(p, 'balanca', None)
        if not antigo:
            continue
        nome = antigo.strip()
        if not nome:
            continue

        if nome in cache:
            b = cache[nome]
        else:
            # Tenta achar por nome
            b = Balanca.objects.filter(nome=nome).first()
            if not b:
                # Gera identificador único a partir do nome
                base = slugify(nome)[:45] or f'bal-{uuid.uuid4().hex[:8]}'
                ident = base
                i = 1
                while Balanca.objects.filter(identificador=ident).exists():
                    i += 1
                    ident = f'{base}-{i}'
                b = Balanca.objects.create(
                    nome=nome,
                    identificador=ident,
                    tipo_conexao='ethernet',  # default arbitrário; ajuste se quiser
                    ativo=True,
                )
            cache[nome] = b

        setattr(p, 'balanca_obj_id', b.id)
        p.save(update_fields=['balanca_obj'])

def backwards(apps, schema_editor):
    # Opcional: se quiser voltar, copie de volta o nome da balança para um campo char 'balanca'
    # (mas como vamos remover o campo antigo, o backward completo exigiria recriá-lo; então deixamos como NOOP)
    pass

class Migration(migrations.Migration):

    dependencies = [
        # coloque aqui a última migration de 'registro'
        ('registro', '0002_balanca'),
    ]

    operations = [
        # 1) adicionar campo temporário
        migrations.AddField(
            model_name='pesagem',
            name='balanca_obj',
            field=models.ForeignKey(blank=True, null=True, on_delete=models.deletion.SET_NULL, related_name='+', to='registro.balanca'),
        ),
        # 2) copiar dados do char para o FK
        migrations.RunPython(forwards, backwards),
        # 3) remover o char antigo
        migrations.RemoveField(
            model_name='pesagem',
            name='balanca',
        ),
        # 4) renomear o temporário para o nome definitivo
        migrations.RenameField(
            model_name='pesagem',
            old_name='balanca_obj',
            new_name='balanca',
        ),
    ]
