<template>
  <main class="auth-view">
    <section class="brand-panel" aria-label="OneDep">
      <span class="brand">OneDep<span class="brand-dot">.</span></span>
    </section>

    <section class="form-panel" aria-labelledby="auth-title">
      <div class="form-inner">
        <h1 id="auth-title">{{ isRegister ? '创建账号' : '登录' }}</h1>

        <form @submit.prevent="submit">
          <label v-if="isRegister" class="field">
            <span>姓名</span>
            <input
              v-model.trim="name"
              autocomplete="name"
              minlength="2"
              maxlength="80"
              required
              placeholder="你的姓名"
            />
          </label>

          <label class="field">
            <span>{{ isRegister ? '邮箱' : '邮箱或账号' }}</span>
            <input
              v-model.trim="email"
              :type="isRegister ? 'email' : 'text'"
              :autocomplete="isRegister ? 'email' : 'username'"
              maxlength="254"
              required
              :placeholder="isRegister ? 'name@example.com' : '输入邮箱或账号'"
            />
          </label>

          <label class="field">
            <span>密码</span>
            <input
              v-model="password"
              type="password"
              :autocomplete="isRegister ? 'new-password' : 'current-password'"
              :minlength="isRegister ? 8 : undefined"
              :maxlength="128"
              required
              :placeholder="isRegister ? '至少 8 个字符' : '输入密码'"
            />
          </label>

          <fieldset v-if="isRegister" class="role-field">
            <legend>注册身份</legend>
            <label :class="{ selected: role === 'SUBMITTER' }">
              <input v-model="role" type="radio" value="SUBMITTER" />
              <span>提交员</span>
            </label>
            <label :class="{ selected: role === 'REVIEWER' }">
              <input v-model="role" type="radio" value="REVIEWER" />
              <span>审校员</span>
            </label>
          </fieldset>

          <p v-if="error" class="error" role="alert">{{ error }}</p>
          <ElButton class="submit" type="primary" native-type="submit" :loading="submitting">
            {{ submitting ? '请稍候…' : isRegister ? '注册并进入' : '登录' }}
          </ElButton>
        </form>

        <p class="switch">
          {{ isRegister ? '已有账号？' : '还没有账号？' }}
          <RouterLink :to="isRegister ? '/login' : '/register'">
            {{ isRegister ? '去登录' : '创建账号' }}
          </RouterLink>
        </p>
      </div>
    </section>
  </main>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElButton } from 'element-plus/es/components/button/index'
import type { RegistrationRole } from '@onedep/shared'
import { useAuthStore } from '@/stores/auth'

import 'element-plus/es/components/button/style/css'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const isRegister = computed(() => route.name === 'register')
const name = ref('')
const email = ref('')
const password = ref('')
const role = ref<RegistrationRole>('SUBMITTER')
const error = ref('')
const submitting = ref(false)

watch(isRegister, () => {
  password.value = ''
  error.value = ''
})

// 提交选定的公开角色或登录凭据，然后进入工作台。
async function submit() {
  if (submitting.value) return
  submitting.value = true
  error.value = ''

  try {
    if (isRegister.value) {
      await auth.register({
        name: name.value,
        email: email.value,
        password: password.value,
        role: role.value,
      })
    } else {
      await auth.login({ email: email.value, password: password.value })
    }
    await router.push('/')
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '请求失败，请稍后再试'
  } finally {
    submitting.value = false
  }
}
</script>

<style lang="less" scoped>
.auth-view {
  display: grid;
  min-height: 100vh;
  grid-template-columns: minmax(320px, 38%) minmax(0, 1fr);
  color: #202a24;
  background: #f6f7f5;

  .brand-panel {
    display: grid;
    place-items: center;
    padding: 48px;
    color: #f4f7f5;
    background: #17231d;

    .brand {
      font-size: clamp(38px, 4vw, 58px);
      font-weight: 680;
      letter-spacing: -0.07em;
      white-space: nowrap;

      .brand-dot {
        color: #90aa98;
      }
    }
  }

  .form-panel {
    display: grid;
    place-items: center;
    padding: 64px clamp(32px, 8vw, 128px);
    background: #fff;

    .form-inner {
      width: min(100%, 400px);

      h1 {
        margin: 0 0 34px;
        color: #17231d;
        font-size: 28px;
        font-weight: 650;
        letter-spacing: -0.04em;
      }

      form {
        .field {
          display: grid;
          gap: 8px;
          margin-bottom: 20px;
          color: #3d4841;
          font-size: 13px;
          font-weight: 560;

          input {
            width: 100%;
            height: 44px;
            padding: 0 13px;
            border: 1px solid #d9dfda;
            border-radius: 8px;
            outline: none;
            color: #202a24;
            background: #fff;
            font-size: 14px;
            transition:
              border-color 0.16s ease,
              box-shadow 0.16s ease;

            &::placeholder {
              color: #a8b0aa;
            }

            &:focus {
              border-color: #4e725f;
              box-shadow: 0 0 0 3px rgb(36 81 62 / 9%);
            }
          }
        }

        .role-field {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
          margin: 0 0 26px;
          padding: 0;
          border: 0;

          legend {
            margin-bottom: 9px;
            color: #3d4841;
            font-size: 13px;
            font-weight: 560;
          }

          label {
            display: flex;
            min-height: 44px;
            align-items: center;
            gap: 9px;
            padding: 0 13px;
            border: 1px solid #d9dfda;
            border-radius: 8px;
            color: #536057;
            font-size: 14px;
            cursor: pointer;

            &.selected {
              border-color: #4e725f;
              color: #234d3a;
              background: #f1f5f2;
            }

            input {
              margin: 0;
              accent-color: #24513e;
            }
          }
        }

        .error {
          margin: 0 0 18px;
          color: #aa433c;
          font-size: 14px;
        }

        .submit {
          width: 100%;
          height: 44px;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 600;
        }
      }

      .switch {
        margin: 24px 0 0;
        color: #778178;
        font-size: 13px;
        text-align: center;

        a {
          margin-left: 4px;
          color: #26362b;
          font-weight: 600;
          text-underline-offset: 4px;
        }
      }
    }
  }
}
</style>
